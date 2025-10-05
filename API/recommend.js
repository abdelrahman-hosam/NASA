const { recommend } = require('../recommend/recommend')

async function recommended(inputsInfo){
    try{
        const recomndationSystem = new recommend()
        const {recommended, inputsReport} = await recomndationSystem.recommendations(inputsInfo)
        return {
            status: 200,
            data: {
                recommedations: recommended,
                inputs: inputsReport
            }
        }
    }catch(err){
        if(err.message === 'Not valid request'){
            return {
                status: 400,
                data: {
                    error: err.message,
                    message: 'The user did not provide country and/or desired weather or they were invalid',
                    details: 'Please check the validity of the inserted data'
                }
            }
        }else{
            return{
                status: 500,
                data: {
                    message: err.message
                }
            }
        }
    }
}

module.exports = { recommended }