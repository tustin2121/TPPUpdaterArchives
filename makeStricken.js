#!/usr/bin/env node
// dumpUpdater.js
// A node.js conversion of /u/flarn2006's DumpUpdates C# program

const USE_TERSE = true;

// Get the command line arguments, skipping the first two
const [,, LIVE_ID, FORFILE, OUTFILE] = process.argv;

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
		author, stricken, id,
	} = data;
	return { timestamp, body, author, stricken, id, };
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
	let num = 0;

	// Now open the output file
	const OUT = new Writer();
	try {
		OUT.println(`#!/bin/sh\nsed -ri \\`);
		while(true) {
			let updates = await FETCH.getNextPage();
			if (!updates.length) break;
			for (let update of updates) {
				// if (update.stricken) OUT.println(`sed -i 's/(${update.id} .*")(><div)/\\1 stricken\\2/g' ${FORFILE}`);
				if (update.stricken) {
					OUT.println(`-e 's/(${update.id}" .*")(><div)/\\1 stricken\\2/g' \\`);
					num++;
				}
			}
			process.stderr.write('.');
		}
		OUT.println(FORFILE);
	} catch (e) {
		LOGGER.error(`ERROR: `, e);
	} finally {
		OUT.close();
	}
	LOGGER.log(`\nDone: ${num} strike(s) found.`);
})();