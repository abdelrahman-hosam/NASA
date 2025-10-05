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

module.exports = {connect}