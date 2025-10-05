const {Catastrophe} = require('../catastrophe/catastrophe')

async function checkAndUpdate(req, res){
    try{
        const catastopheSystem = new Catastrophe()
        const {updated} = await catastopheSystem.catastropheCheckAndUpdate()
        if(updated.length === 0) return res.status(200).json({updatedData: null})
        else{
            await catastopheSystem.postCatastropheUpdate()
            const {catastrophes} = await catastopheSystem.getByIds(updated)
            return res.status(200).json({updatedData: catastrophes})
        }
    }catch(err){
        return res.status(500).json({message: err.message})
    }
}

async function deleteOld(req, res){
    try{
        const catastopheSystem = new Catastrophe()
        const deleted = catastopheSystem.trackAndDelete()
        if(deleted.length === 0) return res.status(200).json({updatedData: null})
        else{
            const {catastrophes} = await catastopheSystem.getAll()
            return res.status(200).json({updatedData: catastrophes})
        }
    }catch(err){
        return res.status(500).json({message: err.message})
    }
}

module.exports = {checkAndUpdate, deleteOld}