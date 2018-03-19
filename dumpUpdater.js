#!/usr/bin/env node
// dumpUpdater.js
// A node.js conversion of /u/flarn2006's DumpUpdates C# program

const USE_TERSE = true;

// Get the command line arguments, skipping the first two
const [,, LIVE_ID, OUTFILE] = process.argv;

// If not reddit live id was passed to the command line, print help and exit
if (LIVE_ID === undefined) {
	console.log(
`./dumpUpdater.js liveId [outputFile]

This program outputs an html file that has the entire update history of 
a given reddit live updater. The first argument is the id of the updater:
	http://reddit.com/live/[liveId]
The second argument is an optional file to output to. If no file is 
specified, the file will be output to stdout.

This is a node.js conversion by tustin2121 
of the C# program originally made by flarn2006.
`
	);
	return;
}

if (OUTFILE === undefined) {
	//*  //If the below is causing you problems, remove the first slash on this line to comment out the check.
	if (process.stdout.isTTY) {
		console.log(`You should pipe to a file or provide a path as a commandline argument.`);
		return;
	}
	//*/
}

///////////////////////////////////////////////////////////////////////////////////////////////////

const fs = require('fs');
const url = require('url');
const path = require('path');
const util = require('util');
const http = require('https');

/** All logging needs to take place on stderr in case stdout is being used, so set up a stderr console. */
const LOGGER = new console.Console(process.stderr, process.stderr);

class Writer {
	constructor() {
		if (OUTFILE) {
			// Make sure the out file is not a symlink to current.html, but rather a real file.
			const FILE = path.resolve(__dirname, OUTFILE);
			if (fs.lstatSync(FILE).isSymbolicLink()) {
				fs.unlinkSync(FILE);
			}
		}
		/** The output stream. */
		this.outputStream = (OUTFILE)? fs.createWriteStream(path.resolve(__dirname, OUTFILE)) : process.stdout;
	}
	print(...str) {
		let res = util.format.apply(util, str);
		this.outputStream.write(res);
	}
	println(...str) {
		let res = util.format.apply(util, str)+'\n';
		this.outputStream.write(res);
	}
	close() {
		// Calling end() on stdout will throw
		if (this.outputStream !== process.stdout) this.outputStream.end();
	}
}

class Fetcher {
	constructor() {
		this.urlBase = `https://www.reddit.com/live/${LIVE_ID}.json`;
		this.lastName = '';
	}
	getInfo() {
		return new Promise((resolve, reject)=>{
			let loc = url.parse(`https://www.reddit.com/live/${LIVE_ID}/about.json`);
			loc.method = 'GET';
			let req = http.request(loc, (res)=>{
				if (res.statusCode >= 400) return reject(new Error('Requested LiveID does not exist!'));
				
				let json = "";
				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					// LOGGER.log(`BODY: ${chunk}`);
					json += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(json));
					} catch (e) {
						reject(e);
					}
				});
			});
			req.on('error', (e)=>reject(e));
			req.end();
		});
	}
	
	async getNextPage() {
		let attempts = 10;
		let json;
		while (true) {
			attempts--;
			if (attempts === 0) throw new Error('Unable to retrieve data!');
			try {
				json = await this.requestJson(`?after=${this.lastName}&limit=100`);
				break;
			} catch (e) {
				LOGGER.log('getNextPage: ', e);
				if (!e.statusCode) throw e;
				continue;
			}
		}
		if (!json) throw new ReferenceError('Empty JSON!');
		let updates = json.data.children.map((update)=>{
			if (update.kind !== 'LiveUpdate') throw new TypeError('Returned JSON is invalid!');
			return makeUpdate(update.data);
		});
		if (!updates.length) return updates; //empty update list, we're done
		this.lastName = json.data.children[json.data.children.length-1].data.name;
		return updates;
	}
	
	requestJson(queryString) {
		return new Promise((resolve, reject)=>{
			let loc = url.parse(this.urlBase+queryString);
			loc.method = 'GET';
			let req = http.request(loc, (res)=>{
				if (res.statusCode >= 400) {
					let err = new Error('Unsuccessful response!');
					err.statusCode = res.statusCode;
					return reject(err);
				} 
				
				let json = "";
				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					// LOGGER.log(`BODY: ${chunk}`);
					json += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(json));
					} catch (e) {
						reject(e);
					}
				});
			});
			req.on('timeout', () => {
				req.abort();
				let err = new Error('Timeout!');
				err.statusCode = 10;
				reject(err);
			});
			req.on('error', (e)=>reject(e));
			req.end();
		});
	}
}

function makeUpdate(data) {
	const { 
		body_html:body, 
		created_utc:timestamp,
		author, striken, id,
	} = data;
	return { timestamp, body, author, striken, id, };
}

function unescapeHtml(str) {
	return str.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
			.replace(/&#39;/g,`'`).replace(/&quot;/g,`"`);
}
function escapeReddit(str) {
	str = str.replace(/href="\/(?!\/)/g, 'href="https://www.reddit.com/');
	return str;
}

const TAG_DICT = (()=>{
	if (USE_TERSE)
		return {
			update: 'up',
			timestamp: 'ts',
			text: 'tx',
			author: 'auth',
		};
	else
		return {
			update: 'update',
			timestamp: 'timestamp',
			text: 'text',
			author: 'author',
		};
})();

///////////////////////////////////////////////////////////////////////////////////////////////////

// We need the async here, so this needs to be wrapped in the function
(async function() {
	// First check if the id is valid
	const FETCH = new Fetcher();
	let info = await FETCH.getInfo();

	// Now open the output file
	const OUT = new Writer();
	try {
		OUT.println(`<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>${info.data.title} | Reddit Live Updater #${LIVE_ID}</title>
	<style> 
		updates { display: table; } 
		updates > ${TAG_DICT['update']} { display: table-row; }
		updates > ${TAG_DICT['update']}::before { content: attr(ts); display: table-cell; }
		updates > ${TAG_DICT['update']} > div { display: table-cell; }
		updates > ${TAG_DICT['update']}[striken] > div { text-decoration: line-through; }
		updates > ${TAG_DICT['update']}::after { content: '/u/'attr(auth); display: table-cell; } 
		body::before { content: 'Loading'; display:none; }
	</style>
	<link rel="stylesheet" href="dumpedUpdates.css" />
	<script src="dumpedUpdates.js"></script>
</head>
<body>`);
		OUT.println(`\t<header><h3>Updater archive for #${LIVE_ID}</h3><h1>${info.data.title}</h1><h2>${unescapeHtml(info.data.description_html)}</h2></header>`);
		OUT.println(`\t<aside>${escapeReddit(unescapeHtml(info.data.resources_html).replace(/>\n/g, '>'))}</aside>`);
		
		OUT.println(`\t<updates id="${LIVE_ID}">`);
		while(true) {
			let updates = await FETCH.getNextPage();
			if (!updates.length) break;
			for (let update of updates) {
				let attrs = [];
				attrs.push(`id="${update.id}"`);
				attrs.push(`ts="${update.timestamp}"`);
				attrs.push(`auth="${update.author||''}"`);
				if (update.stroken) attrs.push(`striken="true"`);
				
				let str = unescapeHtml(update.body);
				str = str.replace(/>\n/g, '>').replace(/>\n/g, '>');//.replace(/\n/g, ' '); //remove errant newlines
				str = escapeReddit(str);
				str = str.replace('div class="md"', "div"); //remove md classes
				OUT.println(`\t\t<${TAG_DICT['update']} ${attrs.join(' ')}>${str}</${TAG_DICT['update']}>`);
			}
			process.stderr.write('.');
		}
		OUT.println(`\t</updates>
	<style>body::before { content: none; }</style>
</body>
</html>`);
	} catch (e) {
		LOGGER.error(`ERROR: `, e);
	} finally {
		OUT.close();
	}
	LOGGER.log('\nDone.');
})();