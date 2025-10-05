import joblib
import mysql.connector
import pandas as pd
import reverse_geocoder as rg

# Load model (joblib handles gzipped files directly)
model = joblib.load("./MLmodel/model.pkl.gz")

def get_connection():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='password',
        database='weatherapp'
    )

def save_prediction_results(df, connection):
    """Save predictions to MySQL in a single commit."""
    cursor = connection.cursor()
    insert_query = """
        INSERT INTO prediction
        (country, region, city, longitude, latitude, predictedWeather, date, paramsID)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    data_to_insert = [
        (
            row['country'],
            row['region'],
            row['city'],
            row['longitude'],
            row['latitude'],
            row['predictedWeather'],
            row['date'],
            row['id']
        )
        for _, row in df.iterrows()
    ]
    cursor.executemany(insert_query, data_to_insert)
    connection.commit()
    cursor.close()

def main():
    conn = get_connection()
    df_params = pd.read_sql("SELECT * FROM params", conn)

    # ---- Batch reverse geocoding ----
    coords = list(zip(df_params['latitude'], df_params['longitude']))
    locations = rg.search(coords)  # returns list of dicts with 'cc', 'admin1', 'name'
    df_params[['country', 'region', 'city']] = pd.DataFrame(locations)

    # ---- Prepare features for prediction ----
    features = ['PS', 'QV2M', 'TS', 'TQV', 'Var_TQV']
    X = df_params[features]

    # ---- Batch prediction ----
    chunk_size = 1000
    predictions = []
    for start in range(0, len(X), chunk_size):
        end = start + chunk_size
        predictions.extend(model.predict(X.iloc[start:end]))
    df_params['predictedWeather'] = predictions

    # ---- Save results ----
    save_prediction_results(df_params, conn)
    conn.close()
    print("Predictions saved successfully.")

if __name__ == "__main__":
    main()
