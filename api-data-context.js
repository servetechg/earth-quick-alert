const fs = require('fs');

async function extractData() {
    const dataDump = {};

    console.log("Fetching USGS River Data (ALL)...");
    try {
        const usgs = await fetch("https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=ca&parameterCd=00060,00065&siteStatus=active");
        const usgsData = await usgs.json();
        dataDump["USGS_River_Data"] = usgsData;
    } catch (e) { dataDump["USGS_River_Data"] = { error: e.message }; }

    console.log("Fetching NOAA NWPS Gauges (ALL)...");
    try {
        const noaa = await fetch("https://api.water.noaa.gov/nwps/v1/gauges");
        const noaaData = await noaa.json();
        dataDump["NOAA_NWPS_Gauges"] = noaaData;
    } catch (e) { dataDump["NOAA_NWPS_Gauges"] = { error: e.message }; }

    console.log("Fetching NWS Active Flood Alerts (ALL)...");
    try {
        const alerts = await fetch("https://api.weather.gov/alerts/active?event=Flood%20Warning", {
            headers: { "User-Agent": "Ready2Go-Data-Extraction/1.0" }
        });
        const alertsData = await alerts.json();
        dataDump["NWS_Active_Alerts"] = alertsData;
    } catch (e) { dataDump["NWS_Active_Alerts"] = { error: e.message }; }

    console.log("Fetching FEMA Disaster Declarations (ALL FLOODS)...");
    try {
        const fema = await fetch("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=incidentType%20eq%20'Flood'");
        const femaData = await fema.json();
        dataDump["FEMA_Disasters"] = femaData;
    } catch (e) { dataDump["FEMA_Disasters"] = { error: e.message }; }

    console.log("Fetching ArcGIS Active Fire Perimeters (ALL)...");
    try {
        const arcgis = await fetch("https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1=1&outFields=*&f=json");
        const arcgisData = await arcgis.json();
        dataDump["ArcGIS_Fire_Perimeters"] = arcgisData;
    } catch (e) { dataDump["ArcGIS_Fire_Perimeters"] = { error: e.message }; }

    console.log("Fetching InciWeb Incidents (ALL)...");
    try {
        const inciweb = await fetch("https://inciweb.wildfire.gov/feeds/rss/incidents/", {
            headers: { 
                "User-Agent": "Ready2Go-EmergencyDashboard/1.0",
                "Accept": "application/rss+xml"
            }
        });
         const text = await inciweb.text();
         dataDump["InciWeb_RSS"] = text; // Entire raw XML string
    } catch (e) { dataDump["InciWeb_RSS"] = { error: e.message }; }

    // Writing the raw JSON file
    console.log("Saving full dataset to api-data-context.json. This might take a moment...");
    fs.writeFileSync('api-data-context.json', JSON.stringify(dataDump, null, 2));
    console.log("Done! Created api-data-context.json with ALL raw data.");
}

extractData();