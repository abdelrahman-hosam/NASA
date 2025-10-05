const fs = require("fs")
const axios = require("axios")
const moment = require("moment")
const { spawn } = require("child_process")
const { connect } = require('../db/connect')
const nodeGeoCoder = require('node-geocoder')

class Catastrophe {
    constructor() {
        this.endpoints = {
        Floods: [
            {
            layer: "Flood_Inundation",
            params: { date: "Date", status: "Active" }
            },
            {
            layer: "Flood_SensorReadings",
            params: { date: "Date", status: "Operational" }
            }
        ],
        Hurricanes_TropicalCyclones: [
            {
            layer: "Cyclone_Tracks",
            params: { date: "Date", status: "Active" }
            },
            {
            layer: "Cyclone_Intensity",
            params: { date: "Date", status: "Valid" }
            }
        ],
        Wildfires: [
            {
            layer: "Fire_Hotspots",
            params: { date: "Date", status: "Active" }
            },
            {
            layer: "Burned_Area",
            params: { date: "Date", status: "Final" }
            }
        ],
        Landslides: [
            {
            layer: "Landslide_Events",
            params: { date: "Date", status: "Active" }
            }
        ],
        Volcanoes: [
            {
            layer: "Volcano_Eruptions",
            params: { date: "Date", status: "Active" }
            }
        ],
        Earthquakes: [
            {
            layer: "Earthquake_Events",
            params: { date: "Date", status: "Open" }
            }
        ],
        Severe_Storms: [
            {
            layer: "Storm_Reports",
            params: { date: "Date", status: "Active" }
            }
        ],
        Tsunamis: [
            {
            layer: "Tsunami_Waves",
            params: { date: "Date", status: "Active" }
            }
        ]
        }

        this.detected = this.#loadJson()
    }

    #loadJson() {
        if (fs.existsSync("./detected.json")) {
            return JSON.parse(fs.readFileSync("./detected.json", "utf8"))
        }
        return {}
    }

    #updateJson() {
        fs.writeFileSync("./detected.json", JSON.stringify(this.detected, null, 2), "utf8")
    }

    #coordinatesExecuter(coords) {
        const coordsArr = coords.flat(Infinity)
        const newCoords = []
        for (let i = 0; i < coordsArr.length; i += 2) {
            newCoords.push({ long: coordsArr[i], lat: coordsArr[i + 1] })
        }
        return newCoords
    }

    #geometryParser(geometry) {
        let parsedCoords = []
        if (geometry.type !== "GeometryCollection") {
            parsedCoords = this.#coordinatesExecuter(geometry.coordinates)
        } else {
            for (const geom of geometry.geometries) {
                const newCoords = this.#coordinatesExecuter(geom.coordinates)
                parsedCoords.push(...newCoords)
            }
        }
        return parsedCoords
    }

    async catastropheCheckAndUpdate() {
        const mainLayers = Object.keys(this.endpoints)
        const today = moment().format("YYYY-MM-DD")
        const updated = []

        for (const endpoint of mainLayers) {
            const sublayers = this.endpoints[endpoint]
            for (const sublayer of sublayers) {
                const statusFilter = sublayer.params.status ? `${sublayer.params.status}='Active'%20AND%20` : ""
                const res = await axios.get(
                    `https://example.nasa.api/${endpoint}/${sublayer.layer}?where=${statusFilter}${sublayer.params.date}=DATE'${today}'`
                )

                for (const feature of res.data.features) {
                    const objId = feature.properties.OBJECTID || feature.properties.FID
                    const key = `${objId}_${sublayer.layer}`

                    if (!this.detected[key]) {
                        this.detected[key] = {
                            coords: this.#geometryParser(feature.geometry),
                            date: today,
                            type: endpoint,
                            subType: sublayer.layer,
                            DBupdated: false
                        }
                    }
                    updated.push(key)
                }
            }
        }
        this.#updateJson()
        return {updated}
    }

    #getNewParams(coords, date) {
        return new Promise((resolve, reject) => {
            const inputData = JSON.stringify({ coords, date })
            const getParams = spawn("python3", ["./postcatastrophe.py"])

            let resolveRes = ""
            let rejectRes = ""

            getParams.stdout.on("data", (data) => (resolveRes += data.toString()))
            getParams.stderr.on("data", (data) => (rejectRes += data.toString()))

            getParams.on("close", (code) => {
                if (code === 0) {
                    try {
                        resolve(JSON.parse(resolveRes))
                    } catch (err) {
                        reject(err)
                    }
                } else {
                    reject(rejectRes)
                }
            })

            getParams.stdin.write(inputData)
            getParams.stdin.end()
        })
    }


      async #updateDB(updated){
        let connection
        try{
            const pool = connect()
            connection = await pool.getConnection()
            for(const [key, data] of Object.entries(updated)){
                const parameters = data['parameters']
                const firstObj = parameters['PS'][0]
                const lat = firstObj['original_coord']['lat']
                const long = firstObj['original_coord']['long']
                for(const [param, vals] of Object.entries(parameters)){
                    const forecast = vals['forecast']
                    const updateQuery =`UPDATE params
                                        SET ${param} = ?
                                        WHERE date = ? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`
                    for(const [day, params] of Object.entries(forecast)){
                        const iterateDays = parseInt(day.split('_')[1])
                        const baseDate = moment(data.date, 'YYYY-MM-DD')
                        const targetDate = baseDate.clone().add(iterateDays, 'days').format('YYYY-MM-DD')
                        const read = params[param]
                        await connection.query(updateQuery, [read, targetDate, lat - 2, lat + 2, long - 2, long + 2])
                    }
                }
            }
        }catch(err){
            throw new Error(err.message)
        }finally{
            if(connection) connection.release()
        }
    }

    async postCatastropheUpdate() {
        const needsUpdate = Object.entries(this.detected)
            .filter(([_, catas]) => !catas.DBupdated)
            .map(([key, catas]) => ({ key, ...catas }))

        const updated = {}

        for (const updating of needsUpdate) {
            const newParams = await this.#getNewParams(updating.coords, updating.date)
            updated[updating.key] = { parameters: newParams }
            this.detected[updating.key].DBupdated = true
        }
        await this.#updateDB(updated)
        this.#updateJson()
        return updated
    }

    trackAndDelete() {
        const twoWeeksBefore = moment().subtract(14, "days")
        const needsDelete = Object.entries(this.detected).filter(([_, detected]) =>
            moment(detected.date).isBefore(twoWeeksBefore)
        )

        for (const deleting of needsDelete) {
            delete this.detected[deleting[0]]
        }

        this.#updateJson()
        return needsDelete
    }

    async getByIds(IDs){
        const getData = Object.entries(this.detected).filter(([id, values]) => IDs.includes(id)).map(([id, values]) => [values['type'], values['subType'], values['date'], values['coords']])
        const catastrophes = []
        for(const item of getData){
            const itemParams = {type: item[0], subType: item[1], date: item[2]}
            const lat = item[3][0]['lat']
            const lon = item[3][0]['long']
            try{
                const paramsFrmCoord = await nodeGeoCoder({provider: 'openstreetmap'}).reverse({lat, lon})
                itemParams.country = paramsFrmCoord[0].country
                itemParams.region = paramsFrmCoord[0].state
                itemParams.city = paramsFrmCoord[0].city
            }catch(err){
                itemParams.country = 'unknown'
                itemParams.region = 'unknown'
                itemParams.city = 'unknown'
            }
            catastrophes.push(itemParams)
        }
        return {catastrophes}
    }

    async getAll(){
        const getData = Object.entries(this.detected).map(([id, values]) => [values['type'], values['subType'], values['date'], values['coords']])
        const catastrophes = []
        for(const item of getData){
            const itemParams = {type: item[0], subType: item[1], date: item[2]}
            const lat = item[3][0]['lat']
            const lon = item[3][0]['long']
            try{
                const paramsFrmCoord = await nodeGeoCoder({provider: 'openstreetmap'}).reverse({lat, lon})
                itemParams.country = paramsFrmCoord[0].country
                itemParams.region = paramsFrmCoord[0].state
                itemParams.city = paramsFrmCoord[0].city
            }catch(err){
                itemParams.country = 'unknown'
                itemParams.region = 'unknown'
                itemParams.city = 'unknown'
            }
            catastrophes.push(itemParams)
        }
        return {catastrophes}
    }
}

module.exports = { Catastrophe }
