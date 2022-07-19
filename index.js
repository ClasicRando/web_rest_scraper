let terminal;
let metadata;

/**
 * Extends the Termynal widget provide by the termynal project
 * Adds the ability to accpet user input and add new lines after initialization
 */
class CustomTerminal extends Termynal {
    /**
     * Overrides the start function from the parent class
     * Delegates line element handling to an async member function
     */
    async start() {
        await this._wait(this.startDelay);

        for (const line of this.lines) {
            await this.handleLine(line);
            line.removeAttribute(`${this.pfx}-cursor`);
        }
    }

    /**
     * Handles adding lines to the termynal widget
     * 
     * Exposes line adding operation to initialization and line appending
     * @param {Node} element 
     */
    async handleLine(element) {
        const type = element.getAttribute(this.pfx);
        const delay = element.getAttribute(`${this.pfx}-delay`) || this.lineDelay;
        switch(type) {
            case 'input':
                element.setAttribute(`${this.pfx}-cursor`, this.cursor);
                await this.type(element);
                await this._wait(delay);
                break;
            case 'progress':
                await this.progress(element);
                await this._wait(delay);
                break;
            case 'user-input':
                this.userInput(element);
                await this._wait(delay);
                break;
            default:
                this.container.appendChild(element);
                await this._wait(delay);
                break;
        }
    }

    /**
     * Add an element within the line to accept user input
     * 
     * Uses some of the line attributes to populate child attributes
     * @param {Node} line
     */
    userInput(line) {
        const childId = line.getAttribute(`${this.pfx}-childId`);
        const handler = new Function('event', line.getAttribute(`${this.pfx}-handler`));
        const input = document.createElement('textarea');
        input.setAttribute('id', childId);
        input.setAttribute('class', 'user-input');
        input.setAttribute('type', 'text');
        input.setAttribute('rows', '1');
        input.addEventListener('keydown', handler);
        // For some reason, in Firefox the input does not line up with the prompt text
        // so I just hardcoded a different style for that case
        if (window.navigator.userAgent.indexOf('Firefox') != -1)
            input.setAttribute('style', 'margin: 0px 0px -5px 0px;');
        line.appendChild(input);
        this.container.appendChild(line);
        document.querySelector(`#${childId}`).focus();
    }

    /**
     * Add a single line to the terminal based upon the object attributes
     * 
     * Uses the same object style as the termynal project's 'lineData' property with the exception
     * of the new 'user-input' type. This type requires some new properties:
     *      1. childId - id used to find the input element
     *      2. handler - dynamic js code that is used for the keydown event
     * @param {object} line 
     */
    async addLine(line) {
        document.querySelector('#terminal').lastElementChild.removeAttribute(`${this.pfx}-cursor`);
        const div = document.createElement('div');
        div.innerHTML = `<span ${this._attributes(line)}>${line.value}</span>`;
        await this.handleLine(div.firstElementChild)
        window.scrollTo(0,document.body.scrollHeight);
    }

    /**
     * Add multiple lines to the terminal
     * 
     * Similar approach to the single line adding but allows for a list of objects to be passed
     * Treats the list as having the first entry as a header and the rest as indented values
     * 
     * TODO
     * - simplify code to have this function call the addLine function for each entry in the array
     * @param {object[]} lines 
     */
    async addLines(lines) {
        for (const [i, line] of lines.entries()) {
            document.querySelector('#terminal').lastElementChild.removeAttribute(`${this.pfx}-cursor`);
            const div = document.createElement('div');
            const outputText = i > 0 ? `&emsp;&emsp;${line.value}` : line.value;
            div.innerHTML = `<span ${this._attributes(line)}>${outputText}</span>`;
            await this.handleLine(div.firstElementChild)
            window.scrollTo(0,document.body.scrollHeight);
        }
    }
}

/**
 * Perform fetch and json extraction for the provided url
 * 
 * Handles errors during fetch and json async functions. In the event an error is thrown or the response is not ok, an object
 * is returned with a success flag of false and a payload of either the error or the response text. If nothing does wrong,
 * an object with a success flag of true and a pyalod of the response json is returned.
 * 
 * @param {string} url
 * @returns {Promise<{success: boolean, payload: any}>}
 */
async function fetchJson(url) {
    let response = null;
    let json = null;
    try {
        response = await fetch(url);
    } catch (ex) {
        console.error(ex)
        return {
            success: false,
            payload: ex,
        }
    }
    if (response.status !== 200 || !response.ok) {
        return {
            success: false,
            payload: await response.text(),
        }
    }
    try {
        json = await response.json();
    } catch (ex) {
        console.error(ex);
        return {
            success: false,
            payload: await response.text(),
        }
    }
    return {
        success: true,
        payload: json,
    }
}

/**
 * Get the query portion of a URL to get the max and min value of a specified field
 * 
 * TODO
 * - implement URLSearchParams rather than an HTML encoded string
 * @param {string} oidField 
 * @returns {string} query string interpolated with field name
 */
function maxMinQuery(oidField) {
    return `/query?outStatistics=%5B%0D%0A+%7B%0D%0A++++"statisticType"%3A+"max"%2C%0D%0A++++"` +
    `onStatisticField"%3A+"${oidField}"%2C+++++%0D%0A++++"outStatisticFieldName"%3A+"maxValue"` +
    `%0D%0A++%7D%2C%0D%0A++%7B%0D%0A++++"statisticType"%3A+"min"%2C%0D%0A++++"onStatisticField"` +
    `%3A+"${oidField}"%2C+++++%0D%0A++++"outStatisticFieldName"%3A+"minValue"` +
    `%0D%0A++%7D%0D%0A%5D&f=json`;
}

/**
 * Obtain metadata JSON object when provided the base url of an ArcGIS REST Service
 * @param {string} url 
 * @returns {object} JSON object with values describing Service and providing queries for scrpaing
 */
async function getMetadata(url) {
    const countQuery = '/query?where=1%3D1&returnCountOnly=true&f=json';
    const fieldQuery = '?f=json';
    let pagination = false;
    let stats = false;
    let maxMinOid = [-1, -1];
    let incOid = false;
    let queries = []

    // Get count from service when quering all features
    const countResponse = await fetchJson(url + countQuery);
    if (!countResponse.success) {
        return {error: countResponse.payload};
    }
    const sourceCount = countResponse.payload.count ? countResponse.payload.count : -1;

    // Get JSON data about service. Provides information for scrpaing
    const metaResponse = await fetchJson(url + fieldQuery);
    if (!metaResponse.success) {
        return {error: metaResponse.payload};
    }
    const metaJson = metaResponse.payload;
    const advancedQuery = metaJson.advancedQueryCapabilities || {};
    const serverType = metaJson.type;
    const name = metaJson.name;
    const maxRecordCount = metaJson.maxRecordCount;
    const maxQueryCount = maxRecordCount > 10000 ? 10000 : maxRecordCount;
    // If 'advancedQueryCapabilities' is a key in the base JSON response then get the suppored
    // features from that object. If not then try to obtain them from the base JSON
    if (Object.keys(advancedQuery).length > 0) {
        pagination = advancedQuery.supportsPagination || false;
        stats = advancedQuery.supportsStatistics || false;
    } else {
        pagination = metaJson.supportsPagination || false;
        stats = metaJson.supportsStatistics || false;
    }
    const geoType = metaJson.geometryType || '';
    // If service is not a TABLE then include geometry parsing using the NAD83 spatial reference
    // TODO
    // - Add spatial reference overriding to default from service or specified spatial reference
    const geoText = serverType !== 'TABLE' ? `&geometryType=${geoType}&outSR=4269` : '';
    // Get all field names while filtering out any geometry field or field named SHAPE. Any field
    // that follows those criteria are not required. Could add ability to keep those fields later
    let fields = metaJson.fields.filter(field =>
        field.name !== 'Shape' && field.type !== 'esriFieldTypeGeometry'
    ).map(field =>
        field.name
    );
    // Depending upon the geometry type, fields are added to the output fields list
    if (geoType === 'esriGeometryPoint')
        fields = [...fields, 'X', 'Y'];
    else if (geoType === 'esriGeometryMultipoint')
        fields = [...fields, 'POINTS'];
    else if (geoType === 'esriGeometryPolygon')
        fields = [...fields, 'RINGS'];
    // Find first field that is of type OID and get the name. If nothing found or name is not an
    // attribute of the find result then default to empty string
    const oidField = metaJson.fields.find(field =>
        field.type === 'esriFieldTypeOID'
    ).name || '';
    // If pagination is not supported, statistics is supported and the service has an OID field,
    // then get the max and min OID values which are used to generate scraping queries
    if (!pagination && stats && oidField.length > 0) {
        const maxMinResposne = await fetchJson(url + maxMinQuery(oidField));
        if (!maxMinResposne.success) {
            return {error: maxMinResposne.payload};;
        }
        const attributes = maxMinResposne.payload.features[0].attributes;
        maxMinOid = [attributes.MAXVALUE, attributes.MINVALUE];
    } 
    // If pagination is not supported, statistics is not supported but the service has an OID field,
    // then get all the oidValues of the service and store the max and min of those values
    else if (!pagination && !stats && oidField.length > 0) {
        const oidValuesResponse = await fetchJson(url + '/query?where=1%3D1&returnIdsOnly=true&f=json');
        if (!oidValuesResponse.success) {
            return {error: oidValuesResponse.payload};
        }
        const oidValues = oidValuesResponse.payload['objectIds'];
        maxMinOid = [Math.max(...oidValues), Math.min(...oidValues)];
    }
    incOid = maxMinOid[0] - maxMinOid[1] + 1 === sourceCount;
    // TODO
    // - For this section, string queries should be replaced with URLSearchParams
    // If pagination is supported then generate queries based upon result offsets and record
    // counts per query
    if (pagination) {
        queries = [...Array(Math.ceil(sourceCount/maxQueryCount)).keys()].map(i => 
            url + `/query?where=1+%3D+1&resultOffset=${i * maxQueryCount}&resultRecordCount=${maxQueryCount}${geoText}&outFields=*&f=json`
        );
    }
    // If oid field is provided then generate queries using OID ranges
    else if (oidField.length > 0) {
        queries = [...Array(Math.ceil((maxMinOid[0] - maxMinOid[1] + 1) / maxQueryCount)).keys()].map(i => {
            const min_oid = maxMinOid[1] + (i * maxQueryCount);
            return url + `/query?where=${oidField}+>%3D+${min_oid}+and+${oidField}+<%3D+${min_oid + maxQueryCount - 1}${geoText}&outFields=*&f=json`;
        });
    }
    return {
        'queries': queries,
        'info': {
            'Name': name,
            'SourceCount': sourceCount,
            'MaxRecordCount': maxRecordCount,
            'MaxQueryCount': maxQueryCount,
            'Pagination': pagination,
            'Stats': stats,
            'ServerType': serverType,
            'GeometryType': geoType,
            'Fields': fields,
            'OidField': oidField,
            'MaxMinOid': maxMinOid,
            'IncrementalOid': incOid
        }
    };
}

/**
 * Fetch query features then map the data to an array
 * @param {string} query 
 * @param {string} geoType 
 * @returns {object[][]} nested array of objects representing rows of records
 */
async function fetchQuery(query, geoType) {
    let invalidResponse = true;
    let tryNumber = 1;
    let json;
    // Try query multiple times if error is thrown, response status is an error
    // code or if the json response indicates an error occured
    while (invalidResponse) {
        try {
            const response = await fetchJson(query);
            // invalidResponse = !response.ok;
            if (response.success) {
                json = response.payload;
                if (!Object.keys(json).includes('features')) {
                    if (Object.keys(json).includes('error')) {
                        console.log('Request had an error. Retrying');
                        invalidResponse = true;
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        tryNumber++;
                    } else
                        throw Error('Response was not an error but no features found');
                } else {
                    invalidResponse = false;
                }
            } else {
                invalidResponse = true;
                await new Promise(resolve => setTimeout(resolve, 10000));
                tryNumber++;
            }
        } catch (ex) {
            console.error(ex);
            invalidResponse = true;
            await new Promise(resolve => setTimeout(resolve, 10000));
            tryNumber++;
        }
        // Current max number of tries is 10. After that an error is thrown
        if (tryNumber > 10)
            throw Error(`Too many tries to fetch query (${query})`);
    }
    return json.features.map(feature => {
        const output = {};
        // Populate output object with attributes from the feature
        for (const [key, value] of Object.entries(feature.attributes)) {
            output[key] = typeof value === "string" ? value.trim(): value;
        }
        // extract the feature's geometry into the output object
        if (geoType === 'esriGeometryPoint') {
            const {x,y} = feature.geometry || {x: '', y: ''};
            output['X'] = typeof x === "string" ? x.trim(): x;
            output['Y'] = typeof y === "string" ? y.trim(): y;
        }
        else if (geoType === 'esriGeometryMultipoint') {
            output['POINTS'] = JSON.stringify(((feature.geometry || {points: []}).points || [])).trim()
        }
        else if (geoType === 'esriGeometryPolygon') {
            output['RINGS'] = JSON.stringify(((feature.geometry || {rings: []}).rings || [])).trim()
        }
        return output;
    });
}

/**
 * Fetchs service metadata then displays the results onto the terminal widget
 */
async function scrapeMetadata() {
    terminal.addLine({type: 'message', value: 'Starting data scrape'});
    terminal.addLine({type: 'message', value: 'Collecting Metadata'});
    const url = document.querySelector('#url').value;
    metadata = await getMetadata(url);
    // If the metadata scrape had an error, show the error on the terminal and return
    if ('error' in metadata) {
        await terminal.addLine({type: 'message', value: 'Error while trying to collect metadata'});
        await terminal.addLine({type: 'message', value: metadata.error});
        return;
    }
    terminal.lineDelay = 50;
    for (const [key, value] of Object.entries(metadata.info)) {
        if (Array.isArray(value))
            await terminal.addLines([key, ...value].map(text => { return {type: 'message', value: text}}));
        else
            await terminal.addLine({type: 'message', value: `${key}: ${value}`});
    }
    terminal.lineDelay = 800;
    await terminal.addLine({type: 'message', value: 'Done Metadata collection. Continue with scrape(y/n)?'});
    await terminal.addLine(
        {
            type: 'user-input',
            prompt: '>',
            childId: 'proceed',
            handler: `{
                if (event.code == 'Enter' || event.code == 'NumpadEnter') {
                    const response = document.querySelector('#proceed').value;
                    document.querySelector('#proceed').setAttribute('disabled', '');
                    if (response.toUpperCase() !== 'Y')
                        setTimeout(exitTerminal,1,'Did not want to proceed with Scrape');
                    else
                        setTimeout(scrapeData,1);
                }
            }`,
            value: ''
        }
    )
}

/**
 * Ends the user interaction with the terminal due to user input or error
 * 
 * Displays a message provided to the function then added line noting end of session
 * @param {string} message 
 */
async function exitTerminal(message) {
    await terminal.addLine({type: 'message', value: message});
    await terminal.addLine({type: 'message', value: 'Exiting Terminal'});
}

/**
 * Executes all queries from the service metadata and parses all the features into a CSV
 */
async function scrapeData() {
    await terminal.addLine({type: 'message', value: 'Starting scrape'});
    const tasks = metadata.queries.map(query => fetchQuery(query, metadata.info.GeometryType))
    const result = await Promise.all(tasks);
    await terminal.addLine({type: 'message', value: 'Done fetching data! Parsing to CSV'});
    const data = Papa.unparse({data: result.flat(1), fields: metadata.info.Fields});
    const csv = new Blob(['\ufeff', data]);
    const download = document.createElement("a")
    download.href = URL.createObjectURL(csv)
    download.download = `${metadata.info.Name}.csv`

    document.body.appendChild(download)
    download.click()
    document.body.removeChild(download)
}

/**
 * Function called when HTML body is loaded. Adds terminal element and builds widget
 */
function start() {
    document.body.innerHTML += '<div id="terminal"></div>';
    terminal = new CustomTerminal(
        '#terminal',
        {
            typeDelay: 10,
            lineDelay: 800,
            lineData: [
                {type: 'message', value: 'Welcome to the ArcGIS REST Service Scraper!'},
                {type: 'message', value: 'Enter the base url of the service you want to scrape below'},
                {
                    type: 'user-input',
                    prompt: '>',
                    childId: 'url',
                    handler: `{
                        if (event.code == 'Enter' || event.code == 'NumpadEnter') {
                            document.querySelector('#url').setAttribute('disabled', '');
                            setTimeout(scrapeMetadata,1);
                        }
                    }`,
                    value: ''
                }
            ]
        }
    )
}
