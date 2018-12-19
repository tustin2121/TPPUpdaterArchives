// Inject jQuery
(function(fn){
	var jq = document.createElement('script');
	jq.src = '/js/lib/jquery-2.1.4.min.js';
	jq.onload = fn;
	document.head.appendChild(jq);
})(function(){
/* global $ */

var listOfTypes = {
	// Define common types in order they should appear
	'Timestamped': 0,
	'Info': 0,
	'Fluff': 0,
	'Snark': 0,
	'Chat': 0,
	'Streamer': 0,
	'Meta': 0,
	'Screenshot': 0,
	'Donation': 0,
	'Correction': 0,
	'Recap': 0,
	'Dev': 0,
	'rip': 0,
};

// var $$css;

$(function(){
	var liveid = $('updates').attr('id');
	var BOTS = ['UpdaterNeeded', 'TPPStreamerBot'];
	var DELETED = ['ItsTyrrellYo', 'CraftingMan', 'quantumsheep', 'Raiinford'];
	
	var total = 0, nonBotTotal = 0;
	var updaters = {};
	$('updates').children().each(function(){
		var classes = [];
		if (!!this.className) {
			// Allow overriding of this method of determining types, to prevent false positives
			classes = this.className.split(' ');
			this.className = this.className.toLowerCase();
		} else {
			var txt = $(this).text();
			txt.replace(/\d{1,2}d \d{1,2}h \d{1,2}m|\[(\w+)\]/gi, function(match, type){
				if (type) {
					type = type.split(/\\\/\|/i);
					for (var t of type) {
						//Correct common error: all lowercase tags
						if (t === t.toLowerCase() && listOfTypes[t] === undefined) {
							// If the tag is all lowercase, and the all lowercase tag is not one of our tags
							var tc = t.charAt(0).toUpperCase() + t.substr(1);
							// And if the title case tag IS one of our tags, replace it.
							if (listOfTypes[tc] !== undefined) t = tc;
						}
						classes.push(t);
					}
				} else {
					classes.push('Timestamped');
				}
				return match;
			});
			$(this).addClass(classes.join(' ').toLowerCase());
		}
		for (var cls of classes) {
			listOfTypes[cls] = (listOfTypes[cls] || 0) + 1;
		}
		
		var ts = $(this).attr('ts');
		ts = new Date(parseInt(ts, 10) * 1000);
		var date = ts.toLocaleString().replace(',', '<br/>');
		date = '<a href="https://www.reddit.com/live/'+liveid+'/updates/'+$(this).attr('id')+'">'+date+'</a>';
		$(this).prepend('<date>'+date+'</date>');
		
		var auth = $(this).attr('auth');
		updaters[auth] = (updaters[auth] || 0) + 1;
		total++;
		if (BOTS.indexOf(auth) === -1) nonBotTotal++;
		auth = '<a href="https://www.reddit.com/u/'+auth+'" rel="nofollow">/u/'+auth+'</a>';
		$(this).append('<author>'+auth+'</author>');

	});
	
	$('head style').remove(); //remove the default style, as we're overriding it all
	
	var $nav = $('<nav>').prependTo('aside');
	{
		$('<li class="md">Info</li>').appendTo($nav);
	}
	if ($('aside .notes').length) {
		$('<li class="notes">Notes</li>').appendTo($nav);
	}
	{
		$('<li class="toolbox">Tools</li>').appendTo($nav);
		var $tools = $('<div class="toolbox">').appendTo('aside');
		{
			var $b = $('<button>').text('Time Sort').on('click', btnTimeSort);
			$('<div>').text(' Reverse the order of the updates').prepend($b).appendTo($tools);
		}
		if ($('.sprite-embed').length) {
			var $b = $('<button>').text('Embed All Sprites').on('click', btnSpriteEmbed);
			$('<div>').text(' Embed all [Sprite] images.').prepend($b).appendTo($tools);
		}
	}{
		$('<li class="stats">Stats</li>').appendTo($nav);
		var $stats = $('<div class="stats">').appendTo('aside');
		var $table = $('<table>');
		$('<tr>').appendTo($table).append('<td>Total</td>').append('<td>'+total+'</td>')
		for (var type in listOfTypes) {
			if (listOfTypes[type] === 0) continue; //skip unused
			var $tr = $('<tr>').appendTo($table)
				.append('<td>'+type+'</td>')
				.append('<td>'+listOfTypes[type]+'</td>')
				.addClass(type.toLocaleLowerCase());
			if (listOfTypes[type] > 500 || type === 'Screenshot') {
				$('<button>').text('Hide').appendTo($tr).wrap('<td>')
					.on('click', hideUpdatesOfType(type.toLowerCase()));
			}
		}{
			var sortable = [];
			for (var updater in updaters) {
				sortable.push([updater, updaters[updater]]);
			}
			sortable.sort(function(a, b){
				return b[1] - a[1];
			});
			var html = '<table>';
			for (var updater of sortable) {
				var classes = (BOTS.indexOf(updater[0]) > -1)?' class="bot"':'';
				classes += (DELETED.indexOf(updater[0]) > -1)?' class="deleted"':'';
				
				html += '<tr'+classes+'><td>'+updater[0]+'</td><td>'+updater[1]+'</td>';
				if (nonBotTotal != total) {
					if (BOTS.indexOf(updater[0]) === -1)
						html += '<td>'+((updater[1]/nonBotTotal)*100).toFixed(2)+'%</td>';
					else html += '<td></td>';
				}
				html += '<td>'+((updater[1]/total)*100).toFixed(2)+'%</td>';
				html += '</tr>';
			}
			html += '</table>';
			html += '<div>Total updates: '+total+'</div>';
			if (nonBotTotal != total) html += '<div>Total non-bot updates: '+nonBotTotal+'</div>';
			
			$('<div class="ustats">').appendTo('aside').html(html);
			$('<li class="ustats">Updaters</li>').appendTo($nav);
		}
		$table.appendTo($stats);
	}
	//*/
	$('aside > nav li').on('click', navclick);
	$('header').prepend('<h4><a href="/">&lt; Home</a></h4>');
	
	$('#enablePokedexBtn').on('click', function(){
		$('body').addClass('fusionembed').prepend('<iframe id="fusionembed" name="fusionembed" src="pokedex.html" />');
		$('#enablePokedexBtn').prop('disabled', true);
	});
});

function navclick() {
	if ($(this).hasClass('selected')) {
		$('aside .selected').removeClass('selected');
	} else {
		$('aside .selected').removeClass('selected');
		$('aside .'+this.className).addClass('selected');
	}
}

function updateStyle() {
	var style = [];
	for (var type in listOfTypes) {
		if (typeof listOfTypes[type] !== 'string') continue;
		switch (listOfTypes[type]) {
			case 'hidden':
				style.push('updates > up.'+type+' { height: 1px; font-size:0 !important; }');
				style.push('.stats table .'+type+' { color: #dddddd }');
				break;
		}
	}
	
	$('body style').html(style.join('\n')); //set the remaining style tag at the bottom of the page
}

function hideUpdatesOfType(type) {
	return function() {
		if (listOfTypes[type] === 'hidden') { //already hidden
			listOfTypes[type] = 'none';
		} else {
			listOfTypes[type] = 'hidden';
		}
		updateStyle();
	};
}
	
function btnTimeSort() {
	$('body').addClass('working');
	setTimeout(function(){
		$('updates').append( $('updates').children().detach().get().reverse() );
		$('body').removeClass('working');
	}, 0);
}

function btnSpriteEmbed() {
	$('body').addClass('working');
	setTimeout(function(){
		$('.sprite-embed').each(function(i, x){
			var url = $(x).text();
			$(x).html('<img src="'+url+'"/>');
		});
		$('body').removeClass('working');
	}, 0);
}

// function calcUpdaterStats() {
// 	var BOTS = ['UpdaterNeeded', 'TPPStreamerBot'];
// 	var total = 0, nonBotTotal = 0;
// 	var updaters = {};
// 	$('updates').children().each(function(){
// 		var a = $(this).attr('auth');
// 		updaters[a] = (updaters[a] || 0) + 1;
// 		total++;
// 		if (BOTS.indexOf(a) === -1) nonBotTotal++;
// 	});
	
// 	var sortable = [];
// 	for (var updater in updaters) {
// 		sortable.push([updater, updaters[updater]]);
// 	}
// 	sortable.sort(function(a, b){
// 		return b[1] - a[1];
// 	});
// 	var html = '<table>';
// 	for (var updater of sortable) {
// 		var bot = (BOTS.indexOf(updater[0]) > -1)?' class="bot"':'';
// 		html += '<tr'+bot+'><td>'+updater[0]+'</td><td>'+updater[1]+'</td>';
// 		if (nonBotTotal != total) {
// 			if (!bot) html += '<td>'+((updater[1]/nonBotTotal)*100).toFixed(2)+'%</td>';
// 			else html += '<td></td>';
// 		}
// 		html += '<td>'+((updater[1]/total)*100).toFixed(2)+'%</td>';
// 		html += '</tr>';
// 	}
// 	html += '</table>';
// 	html += '<div>Total updates: '+total+'</div>';
// 	if (nonBotTotal != total) html += '<div>Total non-bot updates: '+nonBotTotal+'</div>';
	
// 	$('<div class="ustats">').appendTo('aside').html(html);
// 	$('<li class="ustats">Updaters</li>').appendTo('aside nav').on('click', navclick).click();
// }
// window.calcUpdaterStats = calcUpdaterStats; //expose

	
});
