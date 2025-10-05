const { prediction } = require('./prediction')
const { recommended } = require('./recommend')

async function automateRequest(req, res){
    let response
    try{
        const {inputsInfo} = req.body
        if(inputsInfo.desiredWeather){
            response = await recommended(inputsInfo)
        }else{
            const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
            response = await prediction(inputsInfo, ip)
        }
        return res.status(response.status).json(response.data)
    }catch(err){
        return res.status(response.status).json(response.data)
    }
}

module.exports = {automateRequest}