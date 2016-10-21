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

//=========================================================
// Bot Setup
//=========================================================

///*
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
//*/
/*
var server = {
};
server.post = function () { }
var connector = new builder.ConsoleConnector({
});
*/
var bot = new builder.UniversalBot(connector);

var dialog = new builder.SimpleDialog(function (session, results) {
    witClient.get(`/message?v=20161021&q=${encodeURIComponent(session.message.text)}`, function (err, req, res, obj) {
        console.log(JSON.stringify(obj));

        var e = obj.entities;
        var intent = e.intent && e.intent[0].value;

        switch (intent) {
            case `transcodingFailure`:
                session.send('Querying the server');
                esTranscodingFailures("now-12h", "now")
                    .then(function (resp) {
                        session.send(`Total matches: ${resp.hits.total}`);
                        if (resp.hits.total > 0) {
                            const toShow = Math.min(5, resp.hits.total);
                            session.send(`First ${toShow} matches:`);
                            for (let el of resp.hits.hits.slice(0, toShow)) {
                                session.send(el["_source"]["Properties"]["OriginalFileName"]);
                                session.send(el["_source"]["Exception"]);
                            }
                        }
                    });
                break;
            case 'logs':
                var datetime = (e.datetime && e.datetime.length > 0) ? e.datetime[0].value : null;
                var datetimeTxt = datetime ? ` from ${datetime}` : '';

                var numLogs = e.logs || e.number;
                var logs = (numLogs && numLogs.length > 0) ? numLogs[0].value : null;
                var logsTxt = logs ? `${logs} ` : '';

                session.send(`Here are ${logsTxt}logs${datetimeTxt}.`);
                break;
            default:
                esSearch("now-12h", "now", "*");
                session.send(`I don't understand`);
        }
    });
});

bot.dialog('/', dialog);

server.post('/', connector.listen());

function esTranscodingFailures(startDate, endDate)
{
    return esSearch(startDate, endDate, `MessageTemplate: "Transcoding failed"`);
}

function esSearch(startDate, endDate, query, maxSize) {
    return elasticSearchClient.search({
        body: {
            "sort": [
                {
                    "Timestamp": {
                        "order": "desc",
                        "unmapped_type": "boolean"
                    }
                }
            ],
            size: maxSize || 10, 
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
                                        "Timestamp": {
                                            "gte": startDate,
                                            "lte": endDate
                                        }
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