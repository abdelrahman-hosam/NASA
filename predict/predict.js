const geoLocation = require('geoip-lite')
const { Country, State, City } = require('country-state-city')
const db = require('mysql2/promise')

class predict{
    constructor(ip){
        const userLocation = this.#UserParams(ip)
        const {countries, iso} = this.#getCountries()
        const today = moment('YYYY-MM-DD')
        this.userCountry = userLocation.country
        this.userRegion = userLocation.region
        this.userLL = userLocation.ll
        this.userCity = userLocation.city
        this.defaultDate = today
        this.countries = countries
        this.iso = iso
    }

    #UserParams(ip){
        if(ip){
            return geoLocation.lookup(ip)
        }else{
            return {
                country: 'EG',
                region: 'C',
                city: 'Cairo',
                ll: [30.0444, 31.2357]
            }
        }
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

    #regionInfoExtractor(region){
        const regionInfo = State.getAllStates().find(s => s.name === region)
        return {regionInfo}
    }

    #validCountry(country){
        return this.countries.includes(this.iso[country])
    }

    #validDate(date){
        return moment(date, 'YYYY-MM-DD').isValid()
    }

    #validRegionCountry(country, region){
        const regions = State.getAllStates(this.iso[country]).map(r => r.name)
        return regions.includes(region)
    }

    #regionValidator(region){
        return State.getAllStates().some(s => s.name === region)
    }

    #regionExtractor(country, region){
        const countryIso = this.iso[country]
        const regionIso = State.getAllStates(countryIso).find(r => r.name === region)
        return regionIso? regionIso.isoCode : null
    }

    #validCity(country, region, city){
        const cities = City.getAllCities(country, region).map(c => c.name)
        return cities.includes(city)
    }

    #getTopRegion(country){
        const firstRegion = State.getStatesOfCountry(this.iso[country])?.[0]
        return firstRegion? firstRegion.isoCode:null
    }

    #getTopCity(country, region){
        const firstCity = City.getCitiesOfState(country, region)?.[0]
        return firstCity? firstCity.name:null
    }

    #predictParser(predictInfo){
        const parsedPredict = {}
        const inputsReport = {}

        if( !predictInfo.country ||
            !this.#validCountry(predictInfo.country)
        ){
            parsedPredict.country = this.userCountry
            inputsReport.country = predictInfo.country? `${predictInfo.country} is not valid. It was replaced with ${parsedPredict.country}`:`Country was not provided. We used ${parsedPredict.country} instead`
        }else{
            parsedPredict.country = this.iso[predictInfo.country]
            inputsReport.country = `${parsedPredict.country} is valid`
        }

        if( !predictInfo.region ||
            !this.#regionValidator(predictInfo.region)
        ){
            parsedPredict.region = predictInfo.country? (this.iso[predictInfo.country] === parsedPredict.country?
                                                        this.#getTopRegion(predictInfo.country):this.userRegion):this.userRegion
            inputsReport.region = predictInfo.region? `${predictInfo.region} is not valid. It was replaced with ${parsedPredict.region}`:'Region was not provided' 
        }else{
            const {regionInfo} = this.#regionInfoExtractor(predictInfo.region)
            parsedPredict.region = regionInfo.isoCode
            parsedPredict.country = parsedPredict.country === this.iso[predictInfo.country]? this.#validRegionCountry(predictInfo.country, predictInfo.region)? parsedPredict.country: regionInfo.countryCode:regionInfo.countryCode
            inputsReport.region = `${parsedPredict.region} is valid`
        }

        if( !predictInfo.city ||
            !this.#validCity(parsedPredict.country, parsedPredict.region, predictInfo.city)
        ){
            parsedPredict.city = this.#getTopCity(parsedPredict.country, parsedPredict.region)
            inputsReport.city = predictInfo.city? `${predictInfo.city} is not valid. It was replaced with ${parsedPredict.city}`:'City was not provided'
        }else{
            parsedPredict.city = predictInfo.city
            inputsReport.city = `${predictInfo.city} is valid`
        }

        if( !predictInfo.date ||
            !this.#validDate(predictInfo.date)
        ){
            parsedPredict.date = this.defaultDate
            inputsReport.date = predictInfo.date? `${predictInfo.date} is not valid. It was replaced with ${parsedPredict.date}`:'Date was not provided'
        }else{
            parsedPredict.date = predictInfo.date
            inputsReport.date = `${predictInfo.date} is valid`
        }

        return {parsedPredict, inputsReport}
    }

    async prediction(predictInfo){
        const {parsedPredict, inputsReport} = this.#predictParser(predictInfo)

        const conditions = Object.entries(parsedPredict)
        .filter(([_, v]) => v) // ignore null/empty
        .map(([k, v]) => {
            if (["country", "region", "city"].includes(k) ) return [`${k} LIKE ?`, v + "%"];
            if (k === "date") return [`predictDate = ?`, v];
        });

        const predictionQuery = `SELECT * FROM prediction WHERE ` + conditions.map(([c]) => c).join(" AND ");
        const queryParams = conditions.map(([_, v]) => v);

        const [predictData] = await db.query(predictionQuery, queryParams);

        return {predictData, inputsReport}
    }
}

module.exports = {predict}