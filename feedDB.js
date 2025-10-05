import dotenv from 'dotenv'
dotenv.config()
import mysql from 'mysql2/promise'
import fs from 'fs'

function connect(){
    try{
        const pool = mysql.createPool({
            host: process.env.HOST,
            port: process.env.PORT,
            user: process.env.USER,
            password: process.env.PASSWORD,
            database: process.env.DATABASE  
        })
        return pool
    }catch(err){
        throw new Error(err.message)
    }
}

async function feed(){
    let connection;
    try {
        const fileData = fs.readFileSync('./MockWeatherData.json', 'utf8')
        const mockData = JSON.parse(fileData)

        const insertQuery = `INSERT INTO params
                            (latitude, longitude, date, PS, TS, QV2M, TQV, Var_TQV)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        const pool = connect()
        connection = await pool.getConnection()
        
        let insertedCount = 0;
        
        for(const [countryCode, cities] of Object.entries(mockData)){
            console.log(`Processing country: ${countryCode}`)
            
            for(const [cityName, vals] of Object.entries(cities)){
                console.log(`Processing city: ${cityName}`)
                
                const lat = vals['lat']
                const long = vals['long']
                
                // FIX: Remove the extra loop - go directly to dates
                for(const [date, parameters] of Object.entries(vals.data)){
                    const param = [
                        lat,
                        long,
                        date,  // This should be the actual date like '2025-10-01'
                        parameters['PS'],
                        parameters['TS'],
                        parameters['QV2M'],
                        parameters['TQV'],
                        parameters['Var_TQV']
                    ]
                    
                    console.log(`Inserting: ${cityName} - ${date}`, param)
                    await connection.query(insertQuery, param)
                    insertedCount++
                }
            }
        }
        
        console.log(`Successfully inserted ${insertedCount} records!`)
        
    } catch (error) {
        console.error('Error in feed function:', error)
    } finally {
        if (connection) {
            connection.release()
        }
    }
}

await feed()