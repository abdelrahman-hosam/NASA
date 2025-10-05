const geoLoc = require('geoip-lite')
const { Country, State, City } = require('country-state-city')
const moment = require('moment')


class recommend{
    constructor(){
        const {countries, iso} =  this.#getCountries()
        this.countries = countries
        this.iso = iso
    }

    #getCountries(){
        const countriesDict = Country.getAllCountries()
        const countries = []
        const iso = {}
        for(const country of countriesDict){
            countries.push(country.isoCode)
            iso[country.name] = country.isoCode
        }
        return {countries, iso}
    }

    #validRecommendation(country, predictedWeather){
        if( !country || 
            !predictedWeather ||
            !this.countries.includes(this.iso[country]) ||
            isNaN(predictedWeather)
        ) return false
        return true
    }

    #validDate(date){
        return moment(date, 'YYYY-MM-DD').isValid()
    }

    #regionValidator(country, region){
        const regions = State.getAllStates(this.iso[country]).map(r => r.name)
        return regions.includes(region)
    }

    #regionExtractor(country, region){
        const countryIso = this.iso[country]
        const regionIso = State.getAllStates(countryIso).find(r => r.name === region)
        return regionIso? regionIso.isoCode : null
    }

    #validCity(country, region, city){
        const regionIso = this.#regionExtractor(country, region)
        if(!regionIso){
            throw new Error(`${region} is not found`)
        }
        const cities = City.getAllCities(this.iso[country], regionIso).map(c => c.name)
        return cities.includes(city)
    }

    #recommendationParser(recommendInfo){
        const parsedInfo = {}
        const inputsReport = {}

        if( !recommendInfo.date ||
            !this.#validDate(recommendInfo.date)
        ) {
            parsedInfo.date = null
            inputsReport.date = recommendInfo.date? `${recommendInfo.date} is not valid the valid format is YYYY-MM-DD`: 'Date was not provided'
        }
        else{
            parsedInfo.date = recommendInfo.date
            inputsReport.date = `${parsedInfo.date} is valid`
        }

        if( !recommendInfo.region ||
            String(recommendInfo.region).trim() === '' ||
            !this.#regionValidator(recommendInfo.country, recommendInfo.region)
        ){
            parsedInfo.region = null
            inputsReport.region = recommendInfo.region? `${recommendInfo.region} is not valid for ${recommendInfo.country}`:'Region was not provided'
        }else{
            parsedInfo.region = this.#regionExtractor(recommendInfo.region)
            inputsReport.region = `${recommendInfo.region} is valid for ${recommendInfo.country}`
        }

        if( !recommendInfo.city ||
            String(recommendInfo.city).trim() === ''||
            !recommendInfo.region ||
            !this.#validCity(recommendInfo.country, parsedInfo.region, recommendInfo.city)
        ){
          parsedInfo.city = null
          inputsReport.city = recommendInfo.region ? 
                                (recommendInfo.city ?
                                    `${recommendInfo.city} is not valid for ${recommendInfo.country} ${parsedInfo.region}` 
                                    : 'City was not provided') 
                                : 'Region was not provided'

        }else{
            parsedInfo.city = recommendInfo.city
            inputsReport.city = `${parsedInfo.city} is valid`
        }

        return {parsedInfo, inputsReport}
    }

    async #queryWriter(country, predictedWeather, parsedInfo){
        let searchQuery = `SELECT *
                            FROM prediction
                            WHERE country = ? AND`
        const values = [this.iso[country]]

        const rangeLower = predictedWeather - 2
        const rangeUpper = predictedWeather + 2

        const keys = Object.keys(parsedInfo).filter(k => parsedInfo[k] !== null)
        
        for(const key of keys){
            searchQuery += `${key} = ? AND`
            values.push(parsedInfo[key])
        }

        searchQuery += `predictedWeather BETWEEN ? AND ?`

        values.push(rangeLower, rangeUpper)
        return {searchQuery, values}
    }


    async recommendations(recommendInfo){
        if(!this.#validRecommendation(recommendInfo.country, recommendInfo.predictedWeather)) throw new Error('Not valid request')
        const {parsedInfo, inputsReport} = this.#recommendationParser(recommendInfo)
        const {searchQuery, values} = await this.#queryWriter(recommendInfo.country, recommendInfo.predictedWeather, parsedInfo)
        const [recommended] = await mysql.query(searchQuery, [...values])

        return {recommended, inputsReport}
    }
}

module.exports = {recommend}