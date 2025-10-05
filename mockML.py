import mysql.connector
import pandas as pd
import reverse_geocoder as rg
import numpy as np
from typing import List, Tuple, Any

# ---------------- Database Manager ---------------- #
class DatabaseManager:
    def __init__(self, host="localhost", user="root", password="password", database="weatherapp"):
        self.config = {
            "host": host,
            "user": user,
            "password": password,
            "database": database
        }

    def connect(self):
        return mysql.connector.connect(**self.config)

    def fetch_params(self) -> pd.DataFrame:
        """Fetch parameters with optimized query"""
        with self.connect() as connection:
            query = "SELECT id, latitude, longitude, date, PS, QV2M, TS, TQV, Var_TQV FROM params"
            df = pd.read_sql_query(query, connection)
        return df

    def insert_predictions(self, predictions: List[Tuple]) -> None:
        """Batch insert predictions"""
        if not predictions:
            return
            
        connection = self.connect()
        cursor = connection.cursor()

        insert_query = """
        INSERT INTO prediction(country, region, city, latitude, longitude, paramsID, date, predictedWeather)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        cursor.executemany(insert_query, predictions)
        connection.commit()
        cursor.close()
        connection.close()


# ---------------- Weather Predictor ---------------- #
class WeatherPredictor:
    PARAMS = ['PS', 'QV2M', 'TQV', 'Var_TQV']
    
    # Pre-define column names to avoid repeated string operations
    NORM_COLS = [f'norm_{p}' for p in PARAMS]
    WS_COLS = [f'WS_{p}' for p in PARAMS]

    def __init__(self, weights=None):
        self.weights = np.array(weights or [0.2, 0.4, 0.3, 0.1], dtype=np.float32)
        self.maths = {}

    def compute_statistics(self, df: pd.DataFrame) -> None:
        """Compute medians and std dev using vectorized operations"""
        for i, param in enumerate(self.PARAMS):
            self.maths[f'{param}_median'] = df[param].median()
            self.maths[f'{param}_std'] = df[param].std()

    def normalize_and_weight(self, df: pd.DataFrame) -> pd.DataFrame:
        """Vectorized normalization and weighting"""
        # Create a copy to avoid SettingWithCopyWarning
        result_df = df.copy()
        
        # Vectorized normalization and weighting
        for i, param in enumerate(self.PARAMS):
            median = self.maths[f'{param}_median']
            std = self.maths[f'{param}_std']
            weight = self.weights[i]
            
            # Combined normalization and weighting in one step
            result_df[f'WS_{param}'] = ((result_df[param] - median) / std) * weight
        
        # Sum weighted scores
        result_df['W'] = result_df[self.WS_COLS].sum(axis=1)
        return result_df

    def generate_predictions(self, df: pd.DataFrame, delta: float = 0.1) -> pd.DataFrame:
        """Vectorized prediction generation"""
        result_df = df.copy()
        # Vectorized operation with precomputed random noise
        noise = np.random.uniform(-delta, delta, size=len(result_df))
        result_df['predictedWeather'] = result_df['TS'] + result_df['W'] + noise
        return result_df


# ---------------- Pipeline ---------------- #
def run_pipeline():
    print("[INFO] Starting weather prediction pipeline...")

    # Step 1: Database connection
    db = DatabaseManager()
    print("[INFO] Fetching parameters from database...")
    df = db.fetch_params()
    
    if df.empty:
        print("[WARNING] No data found in database.")
        return

    # Step 2: Compute stats & normalize
    predictor = WeatherPredictor()
    print("[INFO] Computing statistics & weights...")
    predictor.compute_statistics(df)

    print("[INFO] Normalizing and applying weights...")
    df = predictor.normalize_and_weight(df)

    # Step 3: Generate predictions
    print("[INFO] Generating predictions...")
    df = predictor.generate_predictions(df)

    # Step 4: Prepare values for insertion - optimized batch processing
    print("[INFO] Resolving locations and preparing DB rows...")
    
    # Batch geocoding - much faster than individual calls
    coords = list(zip(df['latitude'].astype(float), df['longitude'].astype(float)))
    locations = rg.search(coords, mode=2)  # Single batch call
    
    # Vectorized data preparation
    values = []
    for i, (_, row) in enumerate(df.iterrows()):
        location = locations[i]
        values.append((
            location['cc'],              # country
            location['admin1'],          # region/division
            location['name'],            # city
            float(row['latitude']),
            float(row['longitude']),
            int(row['id']),              # paramsID
            row['date'],
            float(row['predictedWeather'])
        ))

    # Step 5: Insert predictions
    print(f"[INFO] Inserting {len(values)} predictions into database...")
    db.insert_predictions(values)

    print("[SUCCESS] Predictions pipeline completed!")


# ---------------- Entry Point ---------------- #
if __name__ == "__main__":
    run_pipeline()