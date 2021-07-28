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
        document.querySelector('#url').focus();
    }

    async handleLine(element) {
        const type = element.getAttribute(this.pfx);
        const delay = element.getAttribute(`${this.pfx}-delay`) || this.lineDelay;
        if (type == 'input') {
            element.setAttribute(`${this.pfx}-cursor`, this.cursor);
            await this.type(element);
            await this._wait(delay);
        } else if (type == 'progress') {
            await this.progress(element);
            await this._wait(delay);
        } else if (type == 'user-input') {
            this.userInput(element);
            await this._wait(delay);
        } else {
            this.container.appendChild(element);
            await this._wait(delay);
        }
    }

    userInput(line) {
        const childId = line.getAttribute(`${this.pfx}-childId`);
        const handler = new Function('event', line.getAttribute(`${this.pfx}-handler`));
        const input = document.createElement('textarea');
        input.setAttribute('id', childId);
        input.setAttribute('class', 'user-input');
        input.setAttribute('type', 'text');
        input.setAttribute('rows', '1');
        input.addEventListener('keydown', handler);
        if (window.navigator.userAgent.indexOf('Firefox') != -1)
            input.setAttribute('style', 'margin: 0px 0px -5px 0px;');
        line.appendChild(input);
        this.container.appendChild(line);
    }

    async addLine(line) {
        document.querySelector('#terminal').lastElementChild.removeAttribute(`${this.pfx}-cursor`);
        const div = document.createElement('div');
        div.innerHTML = `<span ${this._attributes(line)}>${line.value}</span>`;
        await this.handleLine(div.firstElementChild)
        window.scrollTo(0,document.body.scrollHeight);
    }

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

function maxMinQuery(oidField) {
    return `/query?outStatistics=%5B%0D%0A+%7B%0D%0A++++"statisticType"%3A+"max"%2C%0D%0A++++"
    onStatisticField"%3A+"${oid_field}"%2C+++++%0D%0A++++"outStatisticFieldName"%3A+"maxValue"
    %0D%0A++%7D%2C%0D%0A++%7B%0D%0A++++"statisticType"%3A+"min"%2C%0D%0A++++"onStatisticField"
    %3A+"${oid_field}"%2C+++++%0D%0A++++"outStatisticFieldName"%3A+"minValue"
    %0D%0A++%7D%0D%0A%5D&f=json`
}

async function getMetadata(url) {
    const countQuery = '/query?where=1%3D1&returnCountOnly=true&f=json';
    const fieldQuery = '?f=json';
    let pagination = false;
    let stats = false;
    let maxMinOid = [-1, -1];
    let incOid = false;
    let queries = []

    let response = await fetch(url + countQuery);
    let json = await response.json();
    const sourceCount = json.count ? json.count : -1;

    response = await fetch(url + fieldQuery);
    json = await response.json();
    const advancedQuery = json.advancedQueryCapabilities || {};
    const serverType = json.type;
    const name = json.name;
    const maxRecordCount = json.maxRecordCount;
    const maxQueryCount = maxRecordCount > 10000 ? 10000 : maxRecordCount;
    if (Object.keys(advancedQuery).length > 0) {
        pagination = advancedQuery.supportsPagination || false;
        stats = advancedQuery.supportsStatistics || false;
    }
    else {
        pagination = json.supportsPagination || false;
        stats = json.supportsStatistics || false;
    }
    const geoType = json.geometryType || '';
    const geoText = serverType !== 'TABLE' ? `&geometryType=${geoType}&outSR=4269` : '';
    let fields = json.fields.filter(field =>
        field.name !== 'Shape' && field.type !== 'esriFieldTypeGeometry'
    ).map(field =>
        field.name
    );
    if (geoType === 'esriGeometryPoint')
        fields = [...fields, 'X', 'Y'];
    else if (geoType === 'esriGeometryMultipoint')
        fields = [...fields, 'POINTS'];
    else if (geoType === 'esriGeometryPolygon')
        fields = [...fields, 'RINGS'];
    oidFields = json.fields.filter(field =>
        field.type === 'esriFieldTypeOID'
    ).map(field =>
        field.name
    );
    const oidField = oidFields.length > 0 ? oidFields[0] : '';
    if (stats && oidField.length > 0 && !pagination) {
        resposne = await fetch(url + maxMinQuery(oidField));
        json = await response.json();
        const attributes = json.features[0].attributes;
        maxMinOid = [attributes.maxValue, attributes.minValue];
        incOid = maxMinOid[0] - maxMinOid[1] + 1 === sourceCount;
    }
    if (pagination) {
        queries = [...Array(Math.ceil(sourceCount/maxQueryCount)).keys()].map(i => 
            url + `/query?where=1+%3D+1&resultOffset=${i * maxQueryCount}&resultRecordCount=${maxQueryCount}${geoText}&outFields=*&f=json`
        );
    }
    else if (oidField.length > 0) {
        queries = [...Array(Math.ceil((maxMinOid[0] - maxMinOid[1] + 1) / maxQueryCount)).keys()].map(i => 
            url + `/query?where=${oidField}+>%3D+${min_oid}+and+${oidField}+<%3D+${maxMinOid[1] + ((i + 1) * maxQueryCount) - 1}${geoText}&outFields=*&f=json`
        );
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

async function fetchQuery(query, geoType) {
    let invalidResponse = true;
    let tryNumber = 1;
    let json;
    while (invalidResponse) {
        try {
            const response = await fetch(query);
            invalidResponse = !response.ok;
            json = await response.json();
            if (!Object.keys(json).includes('features')) {
                if (Object.keys(json).includes('error')) {
                    console.log('Request had an error. Retrying');
                    invalidResponse = true;
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    tryNumber++;
                } else
                    throw Error('Response was not an error but no features found');
            }
        } catch (ex) {
            console.error(ex);
            await new Promise(resolve => setTimeout(resolve, 10000));
            invalidResponse = true;
            tryNumber++;
        }
        if (tryNumber > 10)
            throw Error(`Too many tries to fetch query (${query})`);
    }
    return json.features.map((feature,i) => {
        let geometry = [];
        if (geoType === 'esriGeometryPoint')
            geometry = Object.values((feature.geometry || {x: '', y: ''})).map(value => typeof(value) === "string" ? value.trim(): value);
        else if (geoType === 'esriGeometryMultipoint')
            geometry = [JSON.stringify(((feature.geometry || {points: []}).points || [])).trim()];
        else if (geoType === 'esriGeometryPolygon')
            geometry = [JSON.stringify(((feature.geometry || {rings: []}).rings || [])).trim()];
        return [
            ...Object.values(feature.attributes).map(value => typeof(value) === "string" ? value.trim(): value),
            ...geometry
        ];
    });
}

async function scrapeMetadata() {
    terminal.addLine({type: 'message', value: 'Starting data scrape'});
    terminal.addLine({type: 'message', value: 'Collecting Metadata'});
    const url = document.querySelector('#url').value;
    metadata = await getMetadata(url);
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

async function exitTerminal(message) {
    await terminal.addLine({type: 'message', value: message});
    await terminal.addLine({type: 'message', value: 'Exiting Terminal'});
}

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