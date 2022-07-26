const chunkSize = 100;
/** @type {HTMLInputElement} */
const baseUrl = document.querySelector("#baseUrl");
/** @type {HTMLFormElement} */
const dataForm = document.querySelector("#dataForm");
/** @type {HTMLFormElement} */
const exportForm = document.querySelector("#exportForm");
/** @type {HTMLButtonElement} */
const metadataButton = document.querySelector("#btnMetadata");
/** @type {HTMLButtonElement} */
const scrapeButton = document.querySelector("#btnScrape");
/** @type {HTMLDivElement} */
const scrapeButtonRow = document.querySelector("#scrapeButtonRow");
/** @type {HTMLUListElement} */
const scrapeOptions = document.querySelector("#scrapeOptions");
/** @type {HTMLDivElement} */
const scrapeProgressBar = document.querySelector(".progress-bar");
/** @type {HTMLDivElement} */
const scrapeProgress = document.querySelector(".progress");
/** @type {HTMLDivElement} */
const toastContainer = document.querySelector("#toastContainer");
/** @type {HTMLSelectElement} */
const timeZoneSelector = document.querySelector("#timeZone");
/** @type {HTMLSelectElement} */
const dateFormatSelector = document.querySelector("#dateFormat");
/** @type {HTMLUListElement} */
const fieldsList = document.querySelector("#fields");
/** @type {ServiceMetadata | null} */
let metadata = null;
/** @type {Array<{display: string, func: (date: Date, zone: string) => string}>} */
const dateFormats = [
    {
        display: "YYYY-MM-DD HH24:Mi:SS Z",
        func: (date, zone) => {
            const newDate = date
            const year = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric"}).format(date);
            const month = new Intl.DateTimeFormat("en", { timeZone: zone, month: "2-digit"}).format(date);
            const day = new Intl.DateTimeFormat("en", { timeZone: zone, day: "2-digit"}).format(date);
            const hour = new Intl.DateTimeFormat("en", { timeZone: zone, hour: "2-digit", hour12: false}).format(date);
            const minute = new Intl.DateTimeFormat("en", { timeZone: zone, minute: "2-digit"}).format(date);
            const second = new Intl.DateTimeFormat("en", { timeZone: zone, second: "2-digit"}).format(date);
            const timeZone = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "short"}).format(date);
            const [_, shortZoneName, ...rest] = timeZone.match(/, (.+)$/);
            return `${year}-${month}-${day} ${hour}:${minute}:${second} ${shortZoneName}`;
        }
    }
];
/** @type {Array<string>} */
const timeZones = Intl.supportedValuesOf('timeZone');
for(const timeZone of timeZones) {
    const zoneOption = document.createElement("option");
    zoneOption.value = timeZone;
    zoneOption.innerText = timeZone;
    if (timeZone === "UTC") {
        zoneOption.setAttribute("selected", "");
    }
    timeZoneSelector.appendChild(zoneOption);
}
for(const [i, dateFormat] of dateFormats.entries()) {
    const formatOption = document.createElement("option");
    formatOption.value = i.toString();
    formatOption.innerText = dateFormat.display;
    if (i === 0) {
        formatOption.setAttribute("selected", "");
    }
    dateFormatSelector.appendChild(formatOption);
}

/**
 * @param {string} where
 */
function countQueryUrlParams(where) {
    return new URLSearchParams({
        "where": where ? where : "1=1",
        "returnCountOnly": "true",
        "f": "json",
    });
}

/**
 * @param {string} where
 */
function idQueryUrlParams(where) {
    return new URLSearchParams({
        "where": where ? where : "1=1",
        "returnIdsOnly": "true",
        "f": "json",
    });
}

/**
 * @param {HTMLElement} element
 */
function removeAllChildren(element) {
    while (element.hasChildNodes()) {
        element.removeChild(element.firstChild);
    }
}

/**
 * 
 * @param {number} milliseconds 
 * @returns {Promise<void>}
 */
async function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function postToast(message) {
    const toast = document.createElement("div");
    toast.classList.add("toast");
    toast.setAttribute("role", "alert");
    const toastHeader = document.createElement("toast-header");
    toastHeader.classList.add("toast-header");
    const headerText = document.createElement("strong");
    headerText.innerText = "Scraper Service";
    headerText.classList.add("me-auto");
    toastHeader.appendChild(headerText);
    const closeButton = document.createElement("button");
    closeButton.classList.add("btn-close");
    closeButton.setAttribute("data-bs-dismiss", "toast");
    toastHeader.appendChild(closeButton);
    toast.appendChild(toastHeader);
    const toastBody = document.createElement("div");
    toastBody.classList.add("toast-body");
    toastBody.innerText = message;
    toast.appendChild(toastBody);
    toastContainer.appendChild(toast);
    const bToast = new bootstrap.Toast(toast);
    await bToast.show();
}

exportForm.querySelector("#chkDate").addEventListener("change", async (e) => {
    const dateInput = exportForm.querySelector("select[name=dateFormat]");
    const timeZoneInput = exportForm.querySelector("select[name=timeZone]");
    if (e.target.checked) {
        dateInput.selectedIndex = 0;
        timeZoneInput.value = "UTC";
        dateInput.removeAttribute("disabled");
        timeZoneInput.removeAttribute("disabled");
    } else {
        dateInput.value = "";
        timeZoneInput.value = "";
        dateInput.setAttribute("disabled", "");
        timeZoneInput.setAttribute("disabled", "");
    }
});
exportForm.querySelector("#chkWhere").addEventListener("change", async (e) => {
    const whereInput = exportForm.querySelector("input[name=where]");
    if (e.target.checked) {
        whereInput.value = "";
        whereInput.removeAttribute("disabled");
    } else {
        whereInput.value = "";
        whereInput.setAttribute("disabled", "");
    }
});
exportForm.querySelector("#chkOutSr").addEventListener("change", async (e) => {
    const outSrInput = exportForm.querySelector("input[name=outSr]");
    if (e.target.checked) {
        outSrInput.value = "";
        outSrInput.removeAttribute("disabled");
    } else {
        outSrInput.value = "";
        outSrInput.setAttribute("disabled", "");
    }
});
metadataButton.addEventListener("click", async () => {
    if (baseUrl.value === "") {
        await postToast("Empty Url");
        return;
    }
    metadataButton.innerHTML = `
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true">
    </span><span class="visually-hidden">Loading...</span>`;
    metadata = await ServiceMetadata.fromBaseUrl(baseUrl.value);
    metadataButton.innerHTML = '<i class="fa-solid fa-server"></i>';
    for(const display of dataForm.querySelectorAll("input")) {
        if (display.id === "sourceSpatialReference") {
            const value = metadata[display.id];
            const name = await fetchEpsgName(value);
            display.value = name ? `${value} - ${name}` : value;
        } else {
            display.value = metadata[display.id];
        }
    }
    removeAllChildren(fieldsList);
    for(const field of metadata.fields) {
        const fieldItem = document.createElement("li");
        fieldItem.classList.add("list-group-item");
        const fieldHeader = document.createElement("h5");
        fieldHeader.innerText = field.name;
        const fieldType = document.createElement("p");
        fieldType.innerText = `Type: ${field.type}`;
        const fieldCoded = document.createElement("p");
        fieldCoded.innerText = `Coded: ${field.isCoded}`;
        fieldItem.appendChild(fieldHeader);
        fieldItem.appendChild(fieldType);
        fieldItem.appendChild(fieldCoded);
        fieldsList.appendChild(fieldItem);
    }
    dataForm.removeAttribute("hidden");
    exportForm.removeAttribute("hidden");
    scrapeButtonRow.removeAttribute("hidden");
});
scrapeButton.parentElement.querySelectorAll('li').forEach((element) => {
    const scrapeType = element.innerText;
    element.addEventListener("click", async () => {
        const exportData = new FormData(exportForm);
        const outputSr = (exportData.get("outSr")||"").trim();
        if (outputSr && !outputSr.match(/^\d+$/)) {
            await postToast("\"Output Spatial Reference\" must be a number");
            return;
        }
        const whereQuery = (exportData.get("where")||"").trim();
        const dateFormat = exportData.get("dateFormat");
        const timeZone = exportData.get("timeZone");
        const getGeometry = exportData.get("includeGeometry");
        scrapeOptions.setAttribute("hidden", "");
        scrapeButton.setAttribute("hidden", "");
        scrapeProgress.removeAttribute("hidden");
        scrapeProgressBar.setAttribute("aria-valuemax", "5");
        switch (scrapeType) {
            case "CSV":
                await metadata.scrapeData(
                    getGeometry === "y",
                    "csv",
                    outputSr ? outputSr : undefined,
                    whereQuery ? whereQuery : undefined,
                    dateFormat ? {
                        format: dateFormats[dateFormat].func,
                        zone: timeZone
                    } : undefined,
                );
                break;
            case "GeoJSON":
                await metadata.scrapeData(
                    getGeometry === "y",
                    "geojson",
                    outputSr ? outputSr : undefined,
                    whereQuery ? whereQuery : undefined,
                    dateFormat ? {
                        format: dateFormats[dateFormat].func,
                        zone: timeZone
                    } : undefined,
                );
                break;
        }
        await sleep(500);
        scrapeProgressBar.style.width = "0%";
        scrapeButton.removeAttribute("hidden");
        scrapeOptions.removeAttribute("hidden");
        scrapeProgress.setAttribute("hidden", "");
    });
});



/**
 * @param {number} epsg
 * @returns {Promise<string>}
 */
 async function fetchEpsgName(epsg) {
    const response = await fetch(`https://epsg.io/${epsg}`);
    if (!response.ok) {
        return "";
    }
    const text = await response.text();
    const [_, name, ...rest] = text.match(/<h2 class="padt-2">(.+?)<\/h2>/);
    return name;
}

/**
 * 
 * @param {string} baseUrl
 * @param {URLSearchParams} params
 * @return {Promise<{ok: boolean, error: string, payload: Object}>}
 */
async function fetchJson(baseUrl, params) {
    const url = new URL(baseUrl);
    url.search = params.toString();
    let response, text, json;
    try {
        response = await fetch(url);
    } catch (ex) {
        return {
            ok: false,
            error: ex.toString(),
            payload: {},
        }
    }
    if (!response.ok) {
        return {
            ok: false,
            error: response.statusText,
            payload: {},
        };
    }
    try {
        text = await response.text();
        json = JSON.parse(text);
    } catch (ex) {
        return {
            ok: false,
            error: text
                ? `Could not deserialize response\n${text}`
                : "Could not fetch body text of response",
            payload: {},
        }
    }
    return {
        ok: !("error" in json),
        error: (json.error||{message: ""}).message,
        payload: json,
    }
}

/**
 * Get the search params of a URL to get the max and min value of a specified field
 * 
 * @param {string} oidField
 * @returns {URLSearchParams} search params of max min query
 */
function maxMinQueryUrlParams(oidField) {
    return new URLSearchParams({
        "outStatistics": JSON.stringify([
            {
                "statisticType": "max",
                "onStatisticField": oidField,
                "outStatisticFieldName": "MAX_VALUE",
            },
            {
                "statisticType": "min",
                "onStatisticField": oidField,
                "outStatisticFieldName": "MIN_VALUE",
            },
        ]),
        "f": "json",
    });
}

/**
 * 
 * @param {string} baseUrl 
 * @param {string} where
 * @returns {Promise<Array<number>>}
 */
async function objectIdsQuery(baseUrl, where="1=1") {
    const response = await fetchJson(`${baseUrl}/query`, idQueryUrlParams(where));
    return response.ok ? response.payload.objectIds : [-1, -1];
}

/**
 * 
 * @param {string} baseUrl 
 * @param {string} oidField
 * @param {boolean} stats
 * @returns {Promise<{max: number, min: number}>}
 */
async function maxMinQuery(baseUrl, oidField, stats) {
    if (!stats) {
        const objectIds = await objectIdsQuery(baseUrl);
        return {
            "max": objectIds[objectIds.length - 1],
            "min": objectIds[0],
        };
    }
    const response = await fetchJson(`${baseUrl}/query`, maxMinQueryUrlParams(oidField));
    if (response.ok) {
        const attributes = response.payload.features[0].attributes;
        return {
            "max": attributes.MAX_VALUE,
            "min": attributes.MIN_VALUE,
        };
    }
    return {
        "max": -1,
        "min": -1,
    };
}

/**
 * 
 * @param {string} baseUrl 
 * @param {string} where
 * @returns {Promise<number | string>}
 */
async function countQuery(baseUrl, where="1=1") {
    const response = await fetchJson(`${baseUrl}/query`, countQueryUrlParams(where));
    return response.ok && "count" in response.payload
        ? response.payload.count
        : response.error;
}

/**
 * 
 * @param {string} baseUrl 
 * @returns {Promise<Object | string>}
 */
async function metadataRequest(baseUrl) {
    const response = await fetchJson(baseUrl, new URLSearchParams({"f": "json"}));
    return response.ok ? response.payload : response.error;
}

class ServiceField {
    /**
     * 
     * @param {string} name 
     * @param {string} type 
     * @param {Map<string | number, string> | undefined} codes 
     */
    constructor(name, type, codes=undefined) {
        /** @type {string} */
        this.name = name;
        /** @type {string} */
        this.type = type;
        /** @type {Map<string | number, string>} */
        this.codes = codes||new Map();
    }

    get isCoded() {
        return this.codes.size > 0;
    }
}


class ServiceMetadata {
    /**
     * 
     * @param {Map<string, any>} options 
     */
    constructor(options) {
        /** @type {string} */
        this.url = options.get("url");
        /** @type {Array<ServiceField>} */
        this.fields = options.get("fields");
        /** @type {string} */
        this.name = options.get("name");
        /** @type {number} */
        this.sourceCount = options.get("sourceCount");
        /** @type {number} */
        this.maxRecordCount = options.get("maxRecordCount");
        /** @type {boolean} */
        this.pagination = options.get("pagination");
        /** @type {boolean} */
        this.stats = options.get("stats");
        /** @type {string} */
        this.serverType = options.get("serverType");
        /** @type {string} */
        this.geoType = options.get("geoType");
        /** @type {string} */
        this.oidField = options.get("oidField");
        /** @type {{max: number, min: number}} */
        this.maxMinOid = options.get("maxMinOid");
        /** @type {number} */
        this.sourceSpatialReference = options.get("spatialReference");
    }

    /**
     * @returns {boolean}
     */
    get incrementalOid() {
        return this.maxMinOid.max - this.maxMinOid.min + 1 === this.sourceCount;
    }

    /**
     * @returns {number}
     */
    get maxQueryCount() {
        return this.maxRecordCount > 10000 ? 10000 : this.maxRecordCount
    }

    /**
     * @returns {string}
     */
    get scrapingMethod() {
        if (this.pagination) {
            return "Pagination";
        } else if (this.incrementalOid) {
            return "OID Ranges";
        } else {
            return "OID Chuncks";
        }
    }

    /**
     * 
     * @param {boolean} getGeometry
     * @param {number} outputSr 
     * @param {string | undefined} where
     * @returns {Promise<Array<string>>}
     */
    async queries(getGeometry, outputSr=undefined, where=undefined) {
        const geoParams = this.serverType !== "TABLE" && getGeometry ? {
            "geometryType": this.geoType,
            "outSr": outputSr||this.sourceSpatialReference,
        } : { "returnGeometry": false };
        let queries = [];
        if (this.pagination) {
            let queryCount = -1;
            if (where) {
                const whereCount = await countQuery(this.url, where);
                if (typeof whereCount === "string") {
                    await postToast(`Error:\n${whereCount}`);
                    return queries;
                }
                console.log(whereCount);
                console.log(this.maxQueryCount);
                queryCount = whereCount/this.maxQueryCount;
            } else {
                queryCount = this.sourceCount/this.maxQueryCount;
            }
            queries = [...Array(Math.ceil(queryCount)).keys()].map(i => {
                const params = new URLSearchParams({
                    'where': where||'1=1',
                    'resultOffset': i * this.maxQueryCount,
                    'resultRecordCount': this.maxQueryCount,
                    'outFields': '*',
                    'f': 'geojson'
                });
                for (const [name, value] of Object.entries(geoParams)) {
                    params.append(name,value);
                }
                return params;
            });
        }
        else if (this.incrementalOid && !where) {
            const max = this.maxMinOid.max, min = this.maxMinOid.min;
            queries = [...Array(Math.ceil((max - min + 1) / this.maxQueryCount)).keys()].map(i => {
                let minOid = min + (i * this.maxQueryCount);
                const params = new URLSearchParams({
                    'where': `${this.oidField} >= ${minOid} and ${this.oidField} <= ${minOid + this.maxQueryCount - 1}`,
                    'outFields': '*',
                    'f': 'geojson'
                });
                for (const [name, value] of Object.entries(geoParams)) {
                    params.append(name,value);
                }
                return params;
            });
        }
        else if (this.oidField) {
            const objectIds = await objectIdsQuery(this.url, where);
            if (objectIds[0]||-1 != -1) {
                for (let i = 0; i < objectIds.length; i += chunkSize) {
                    const chunk = objectIds.slice(i, i + chunkSize);
                    const params = new URLSearchParams({
                        'objectIds': chunk.join(","),
                        'outFields': '*',
                        'f': 'geojson'
                    });
                    for (const [name, value] of Object.entries(geoParams)) {
                        params.append(name,value);
                    }
                    queries.push(params)
                }
            }
        }
        return queries;
    }

    get fieldLabels() {
        return this.fields.map(field =>
            `${field.name}(type=${field.type},coded=${field.codes.size > 0})`
        )
    }

    /**
     * 
     * @param {boolean} getGeometry
     * @param {string} extension
     * @param {number} epsg 
     * @param {string} where
     * @param {{format: (date: Date) => string, zone: string}} dateFormat
     */
    async scrapeData(getGeometry, extension, epsg=undefined, where=undefined, dateFormat=undefined) {
        const baseUrl = this.url;
        const fields = this.fields;
        const queries = await this.queries(getGeometry, epsg,where);
        const queryCount = queries.length;
        if (queryCount === 0) {
            return;
        }
        let queriesComplete = 0;
        const tasks = queries.map(query => {
            const url = new URL(`${baseUrl}/query`);
            url.search = query.toString();
            return fetchQuery(url)
        });
        const result = await tasks.reduce(async (previous, nextTask) => {
            const accum = await previous;
            const result = await nextTask;
            if (typeof(fields.find(field => field.codes)) !== "undefined") {
                for(const feature of result.features) {
                    for (const field of fields) {
                        if (field.codes) {
                            const code = feature.properties[field.name];
                            feature.properties[`${field.name}_DESC`] = field.codes.get(code)||"";
                        }
                        else if (field.type === "esriFieldTypeDate" && dateFormat) {
                            const date = feature.properties[field.name];
                            const fDate = dateFormat.format(new Date(date), dateFormat.zone);
                            feature.properties[`${field.name}_DT`] = fDate;
                        }
                    }
                }
            }
            if (Object.keys(accum).length == 0) {
                scrapeProgressBar.style.width = `${Math.round((++queriesComplete/queryCount)*100)}%`;
                return {
                    "crs": result.crs,
                    "features": result.features,
                    "type": result.type,
                };
            }
            accum.features = [...accum.features, ...result.features];
            scrapeProgressBar.style.width = `${Math.round((++queriesComplete/queryCount)*100)}%`;
            return accum;
        }, Promise.resolve({}));
        const download = document.createElement("a");
        if (extension === "csv") {
            const records = result.features.map(feature => {
                if (getGeometry) {
                    feature.properties["geometry"] = toWkt(feature.geometry);
                }
                return feature.properties;
            });
            const file = new Blob(['\ufeff', Papa.unparse(records)]);
            download.href = URL.createObjectURL(file);
        } else if (extension === "geojson") {
            const features = result.features.map(feature => JSON.stringify(feature)).join(",\n");
            const crs = JSON.stringify(result.crs);
            const records = '{\n"type": "Feature Collection",\n"crs": ' + crs + ',\n"features": [\n' + features + '\n]\n}\n';
            const file = new Blob(['\ufeff', records]);
            download.href = URL.createObjectURL(file);
        }
        download.download = `${this.name}.${extension}`;
    
        document.body.appendChild(download);
        download.click();
        document.body.removeChild(download);
    }

    /**
     * 
     * @param {string} url 
     * @returns {Promise<ServiceMetadata | string>}
     */
    static async fromBaseUrl(url) {
        const options = new Map([["url", url]]);
        let incOid = false;
    
        // Get count from service when quering all features
        const count = await countQuery(url);
        if (typeof(count) === "string") {
            return count;
        }
        options.set("sourceCount", count);
    
        // Get JSON data about service. Provides information for scrpaing
        const metadata = await metadataRequest(url);
        if (typeof(metadata) === "string") {
            return metadata;
        }
        if ("error" in metadata) {
            return {};
        }
        const advancedQuery = metadata.advancedQueryCapabilities || {};
        options.set("serverType", (metadata.type || '').toUpperCase());
        options.set("name", metadata.name || '');
        options.set("maxRecordCount", metadata.maxRecordCount || -1);
        const spatialReferenceObj = metadata.sourceSpatialReference || {};
        options.set("spatialReference", spatialReferenceObj.wkid);
        // If 'advancedQueryCapabilities' is a key in the base JSON response then get the suppored
        // features from that object. If not then try to obtain them from the base JSON
        if (Object.keys(advancedQuery).length > 0) {
            options.set("pagination", advancedQuery.supportsPagination || false);
            options.set("stats", advancedQuery.supportsStatistics || false);
        } else {
            options.set("pagination", metadata.supportsPagination || false);
            options.set("stats", metadata.supportsStatistics || false);
        }
        options.set("geoType", metadata.geometryType || '');
        // Get all field names while filtering out any geometry field or field named SHAPE. Any field
        // that follows those criteria are not required. Could add ability to keep those fields later
        options.set(
            "fields",
            metadata.fields.filter(field =>
                field.name !== 'Shape' && field.type !== 'esriFieldTypeGeometry'
            ).map(field => {
                const domain = field.domain || {};
                const domainType = domain.type || "";
                return new ServiceField(
                    field.name,
                    field.type,
                    domainType === "codedValue" ? new Map(
                        domain.codedValues.map(codedValue => [codedValue.code, codedValue.name])
                    ) : undefined,
                );
            })
        );
        // Find first field that is of type OID and get the name. If nothing found or name is not an
        // attribute of the find result then default to empty string
        options.set(
            "oidField",
            options.get("fields").find(field =>
                field.type === 'esriFieldTypeOID'
            ).name || ''
        );
        // If pagination is not supported, statistics is supported and the service has an OID field,
        // then get the max and min OID values which are used to generate scraping queries
        if (!options.get("pagination") && options.get("oidField")) {
            options.set("maxMinOid", await maxMinQuery(url, options.get("oidField"), options.get("stats")));
        }
        return new ServiceMetadata(options);
    }
}

/**
 * @param {{type: string, coordinates: Array<Array<number> | number>}} geometry
 */
function toWkt(geometry) {
    return `${geometry.type.toUpperCase()} ${parseCoordinates(geometry.coordinates)}`;
}

/**
 * @param {Array<Array<any> | number>} coordinates
 */
function parseCoordinates(coordinates) {
    if (coordinates.length === 0) {
        return "";
    }
    const firstElement = coordinates[0];
    if (Array.isArray(firstElement)) {
        return `(${coordinates.map(arr => parseCoordinates(arr)).join(", ")})`;
    } else {
        return `${coordinates[0]} ${coordinates[1]}`;
    }
}

/**
 * Fetch query features then map the data to an array
 * @param {URL} url 
 * @param {URLSearchParams} params
 * @returns {Promise<Object>} nested array of objects representing rows of records
 */
async function fetchQuery(url) {
    let invalidResponse = true;
    let tryNumber = 1;
    let json;
    // Try query multiple times if error is thrown, response status is an error
    // code or if the json response indicates an error occured
    while (invalidResponse) {
        try {
            const response = await fetch(url);
            invalidResponse = !response.ok;
            if (invalidResponse) {
                await postToast('Not OK Response. Retrying');
                invalidResponse = true;
                await new Promise(resolve => setTimeout(resolve, 10000));
                tryNumber++;
            } else {
                json = await response.json();
                if (!("features" in json)) {
                    if ("error" in json) {
                        console.log('Request had an error. Retrying', url);
                        postToast('Request had an error. Retrying');
                        invalidResponse = true;
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        tryNumber++;
                    } else {
                        throw Error('Response was not an error but no features found');
                    }
                }
            }
        } catch (ex) {
            postToast(`Caught Error: ${ex}`);
            console.error(ex);
            invalidResponse = true;
            await new Promise(resolve => setTimeout(resolve, 10000));
            tryNumber++;
        }
        // Current max number of tries is 10. After that an error is thrown
        if (tryNumber > 10) {
            throw Error(`Too many tries to fetch query (${url.href})`);
        }
    }
    return json;
}
