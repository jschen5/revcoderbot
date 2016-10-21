"use strict";
var restify = require('restify');
var builder = require('botbuilder');
var elasticsearch = require('elasticsearch');
var moment = require('moment');

var elasticSearchClient = new elasticsearch.Client({
    host: 'http://ec2-35-160-221-20.us-west-2.compute.amazonaws.com',
    log: 'trace'
});

var witClient = restify.createJsonClient({
	url: 'https://api.wit.ai',
	headers: {
		Authorization: 'Bearer 2CJZGLMHHFOUGQU5MRHZDT54MXA4CVEK'
	}
});

// convert a time grain to a date math thingy
function dateMathify(grain) {
    return grain[0];
}

function extractInterval(e) {
    var datetime = (e.datetime && e.datetime.length > 0) ? e.datetime : null;
    var range = {"Timestamp": {}}

    if (datetime.type == "value") {
        // case for date and length
        range.Timestamp.gte = datetime.value;
        // double pipe allows date math expressions
        range.Timestamp.lte = datetime.value + "||+1" + dateMathify(datetime.grain);
    } else if (datetime.type == "interval") {
        // case for date interval
        if (datetime.from.value) {
            range.Timestamp.gte = datetime.from.value;
        }
        if (datetime.to.value) {
            range.Timestamp.lte = datetime.to.value;
        }
    } else {
        // debugging
        console.log("anomalous date format")
    }

    // Return a timestamp range for elastic search
    return range
}


//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);

var dialog = new builder.SimpleDialog(function (session, results) {
    witClient.get(`/message?v=20161021&q=${encodeURIComponent(session.message.text)}`, function (err, req, res, obj) {
        console.log(JSON.stringify(obj));

        var e = obj.entities;
        var intent = e.intent[0].value;

        switch (intent) {
            case 'transcodingFailure':
                //obj._text  
                break;
            case 'transcodingFailure':
                var interval = extractInterval(e);
                session.send('transcoding failure');
                // TODO
                session.send(esSearch(interval, "Level: Warning"));
                break;
            case 'logs':
                var interval = extractInterval(e);
                var datetimeTxt = datetime ? `from ${interval.startTime} to ${interval.endTime}` : '';
                var numLogs = e.logs || e.number;
                var logs = (numLogs && numLogs.length > 0) ? numLogs[0].value : null;
                var logsTxt = logs ? `${logs}` : '';

                session.send(`Here are ${logsTxt} logs ${datetimeTxt}. (Search results limited to 5)`);
                // TODO
                session.send(esSearch(startTime, endTime, "Level: Warning"));

                break;
            default:
                session.send('I don\'t understand');
        }

        session.send(JSON.stringify(e));

    });
});

bot.dialog('/', dialog);

server.post('/', connector.listen());

function esSearch(timestampRange, query) {
    return elasticSearchClient.search({
        body: {
            //from: 0,
            "size": 5,
            "sort": [
                {
                    "Timestamp": {
                        "order": "desc",
                        "unmapped_type": "boolean"
                    }
                }
            ],
            "query": {
                "filtered": {
                    "query": {
                        "query_string": {
                            "query": query,
                            "analyze_wildcard": true
                        }
                    },
                    "filter": {
                        "bool": {
                            "must": [
                                {
                                    "range": {
                                        timestampRange
                                    }
                                }
                            ],
                            "must_not": []
                        }
                    }
                }
            },
        }
    });
}


// dialog.matches('show_log_messages', [
//     (session, args, next) => {
//         var logLevel = builder.EntityRecognizer.findEntity(args.entities, 'log_level');
//         if (logLevel) {
//             return next({ response: logLevel.entity });
//         } else {
//             builder.Prompts.text(session, 'What log level?');
//         }
//     },
//     (session, results) => {
//         let request = esSearch("now-12h", "now", "Level: Warning");
//         request.then(function (resp) {
//             session.send(`Total matches: ${resp.hits.total}`);
//             if (resp.hits.total > 0) {
//                 const toShow = Math.min(5, resp.hits.total);
//                 session.send(`First ${toShow} matches:`);
//                 for (let el of resp.hits.hits.slice(0, toShow)) {
//                     session.send(el["_source"]["RenderedMessage"]);
//                 }
//             }
//         })
//         session.send(`querying requested data...`);
//     }
// ]);

// dialog.onDefault(builder.DialogAction.send("I don't understand."));
