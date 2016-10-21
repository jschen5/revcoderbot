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

function isCloseToNow(timestamp) {
    var tolerance = 5 * 60 * 1000; // 5 minutes (ms)
    return (Math.abs((new Date()) - Date.parse(timestamp)) < tolerance);
}

function extractInterval(e) {
    var datetime = (e.datetime && e.datetime.length > 0) ? e.datetime[0] : {};
    var range = {"Timestamp": {}};

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
            range.Timestamp.lte = isCloseToNow(datetime.to.value) ?
                "now" : datetime.to.value;
        }
    } else {
        range = {"Timestamp": {"gte": "now-12h"}};
    }

    return range
}

function getKibanaUrl(interval, query) {
    var from = interval.Timestamp.from ? interval.Timestamp.from : "now-12h";
    var to =  interval.Timestamp.to ? interval.Timestamp.to : "now";
    var mainUrl = "https://kibana-revcoder-prod.rev.com/_plugin/kibana/?#/discover?_g=(refreshInterval:(display:Off,pause:!f,section:0,value:0)," +
        "time:(from:'FROM_DATE_PLACEHOLDER',mode:absolute,to:'TO_DATE_PLACEHOLDER'))" +
        "&_a=(columns:!(_source),index:'cwl-*',interval:auto,query:(query_string:(analyze_wildcard:!t,query:QUERY_PLACEHOLDER)),sort:!(Timestamp,desc))";
    return mailUrl.replace("FROM_DATE_PLACEHOLDER", from)
        .replace("TO_DATE_PLACEHOLDER", to).replace("QUERY_PLACEHOLDER", encodeURI(query));
}

//=========================================================
// Bot Setup
//=========================================================

///*
/// Setup Restify Server
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

function extractMessage(exception)
{
    let firstLine = exception.split('\n').shift();

    if (firstLine != null) {
        let pos = firstLine.indexOf(":");
        if (pos >= 0) {
            return firstLine.substring(pos + 1).trim();
        }
    }
    return firstLine;
}


var dialog = new builder.SimpleDialog(function (session, results) {
    witClient.get(`/message?v=20161021&q=${encodeURIComponent(session.message.text)}`, function (err, req, res, obj) {
        console.log(JSON.stringify(obj));

        var e = obj.entities;
        var intent = e.intent && e.intent[0].value;

        switch (intent) {
            case `transcodingFailure`:
                var interval = extractInterval(e);
                session.send("Querying for transcoding failures in" + JSON.stringify(interval));

                esTranscodingFailures(interval)
                    .then(function (resp) {
                        session.send(`Total matches: ${resp.hits.total}`);
                        if (resp.hits.total > 0) {
                            const toShow = Math.min(5, resp.hits.total);
                            session.send(`First ${toShow} matches:`);
                            for (let el of resp.hits.hits.slice(0, toShow)) {
                                session.send(el["_source"]["Properties"]["OriginalFileName"]);
                                session.send(extractMessage(el["_source"]["Exception"]));
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

function esTranscodingFailures(timestampRange)
{
    return esSearch(timestampRange, `MessageTemplate: "Transcoding failed"`);
}

function esSearch(timestampRange, query, maxSize) {
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
