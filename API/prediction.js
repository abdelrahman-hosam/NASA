const { predict } = require('../predict/predict')

async function prediction(inputsInfo, ip){
    try{
        const predictSystem = new predict(ip)
        const {predictData, inputsReport} = await predictSystem.prediction(inputsInfo)
        return {
            status: 200,
            data: {
                predicted: predictData,
                inputs: inputsReport
            }
        }
    }catch(err){
        return {
            status: 500,
            data:{
            predicted: null,
            inputs: null,
            message: 'The input data could not be processed'
        }
        }
    }
}

module.exports = { prediction }