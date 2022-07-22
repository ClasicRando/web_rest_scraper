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
/** @type {ServiceMetadata | null} */
let metadata = null;

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
 * 
 * @param {number} milliseconds 
 * @returns {Promise<void>}
 */
async function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

metadataButton.addEventListener("click", async () => {
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
    dataForm.removeAttribute("hidden");
    exportForm.removeAttribute("hidden");
    scrapeButtonRow.removeAttribute("hidden");
});
scrapeButton.parentElement.querySelectorAll('li').forEach((element) => {
    const scrapeType = element.innerText;
    element.addEventListener("click", async () => {
        const exportData = new FormData(exportForm);
        scrapeOptions.setAttribute("hidden", "");
        scrapeButton.setAttribute("hidden", "");
        scrapeProgress.removeAttribute("hidden");
        scrapeProgressBar.setAttribute("aria-valuemax", "5");
        switch (scrapeType) {
            case "CSV":
                await metadata.scrapeData(
                    exportData.get("outSr"),
                    "csv",
                    exportData.get("where")
                );
                break;
            case "GeoJSON":
                await metadata.scrapeData(
                    exportData.get("outSr"),
                    "geojson",
                    exportData.get("where")
                );
                break;
        }
        await sleep(1000);
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
 * @return {Promise<{ok: boolean, error: string | undefined, payload: Object | undefined}>}
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
            payload: undefined,
        }
    }
    if (!response.ok) {
        return {
            ok: false,
            error: response.statusText,
            payload: undefined,
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
            payload: undefined,
        }
    }
    return {
        ok: !("error" in json),
        error: json.error,
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
 * @returns {Promise<number>}
 */
async function countQuery(baseUrl, where="1=1") {
    const response = await fetchJson(`${baseUrl}/query`, countQueryUrlParams(where));
    return response.ok && "count" in response.payload
        ? response.payload.count
        : -1;
}

/**
 * 
 * @param {string} baseUrl 
 * @returns {Promise<Object>}
 */
async function metadataRequest(baseUrl) {
    const response = await fetchJson(baseUrl, new URLSearchParams({"f": "json"}));
    return response.ok ? response.payload : {};
}

class ServiceField {
    /**
     * 
     * @param {string} name 
     * @param {string} type 
     * @param {Map<string | number, string>} codes 
     */
    constructor(name, type, codes={}) {
        /** @type {string} */
        this.name = name;
        /** @type {string} */
        this.type = type;
        /** @type {Map<string | number, string>} */
        this.codes = codes;
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
     * @param {number} outputSr 
     * @param {string | undefined} where
     * @returns 
     */
    async queries(outputSr, where=undefined) {
        const geoParams = this.serverType !== "TABLE" ? {
            "geometryType": this.geoType,
            "outSr": outputSr || this.spatialReference,
        } : {};
        let queries = [];
        if (this.pagination) {
            const queryCount = where
                ? (await countQuery(this.url, where))/this.maxQueryCount
                : this.sourceCount/this.maxQueryCount;
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
            `${field.name}(type=${field.type},coded=${Object.keys(field.codes).length == 0})`
        )
    }

    /**
     * 
     * @param {number} epsg 
     * @param {string} extension
     * @param {string} where
     */
    async scrapeData(epsg, extension, where) {
        const baseUrl = this.url;
        const fields = this.fields;
        const queries = await this.queries(epsg,where);
        const queryCount = queries.length;
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
                        if (!field.codes) {
                            continue;
                        }
                        const code = feature.properties[field.name];
                        feature.properties[`${field.name}_DESC`] = field.codes.get(code)||"";
                    }
                }
            }
            if (Object.keys(accum).length == 0) {
                console.log(`Done ${++queriesComplete}/${queryCount}`);
                return {
                    "crs": result.crs,
                    "features": result.features,
                    "type": result.type,
                };
            }
            accum.features = [...accum.features, ...result.features];
            scrapeProgressBar.style.width = `${Math.round((queriesComplete/queryCount)*100)}%`;
            console.log(`Done ${++queriesComplete}/${queryCount}`);
            return accum;
        }, Promise.resolve({}));
        const download = document.createElement("a");
        if (extension === "csv") {
            const records = result.features.map(feature => {
                feature.properties["geometry"] = toWkt(feature.geometry);
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
     * @returns {Promise<ServiceMetadata>}
     */
    static async fromBaseUrl(url) {
        const options = new Map([["url", url]]);
        let incOid = false;
    
        // Get count from service when quering all features
        options.set("sourceCount", await countQuery(url));
    
        // Get JSON data about service. Provides information for scrpaing
        const metadata = await metadataRequest(url);
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
                    ) : null,
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
    return `${geometry.type.toUpperCase()}(${parseCoordinates(geometry.coordinates)})`;
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
        return `(${coordinates.map(arr => parseCoordinates(arr).join(", "))})`;
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
                console.log('Not OK Response. Retrying');
                invalidResponse = true;
                await new Promise(resolve => setTimeout(resolve, 10000));
                tryNumber++;
            } else {
                json = await response.json();
                if (!("features" in json)) {
                    if ("error" in json) {
                        console.log(url);
                        console.log('Request had an error. Retrying');
                        invalidResponse = true;
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        tryNumber++;
                    } else {
                        throw Error('Response was not an error but no features found');
                    }
                }
            }
        } catch (ex) {
            console.error(ex);
            await new Promise(resolve => setTimeout(resolve, 10000));
            invalidResponse = true;
            tryNumber++;
        }
        // Current max number of tries is 10. After that an error is thrown
        if (tryNumber > 10) {
            throw Error(`Too many tries to fetch query (${url.href})`);
        }
    }
    return json;
}
