"use strict";
var restify = require('restify');
var builder = require('botbuilder');
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'http://ec2-35-160-221-20.us-west-2.compute.amazonaws.com',
    log: 'trace'
});

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

/*
var server = {
};
server.post = function () { }
var connector = new builder.ConsoleConnector({
    //    appId: 'c413b2ef-382c-45bd-8ff0-f76d60e2a821',
    //    appSecret: 'd7cd8e8da47c44f296806ff2c7a6873c'
});
*/

var bot = new builder.UniversalBot(connector);
var model = 'https://api.projectoxford.ai/luis/v1/application?id=79bf0f42-0b72-4e09-94e8-28f1c07b2020&subscription-key=d7cd8e8da47c44f296806ff2c7a6873c&q=';
var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);

server.post('/', connector.listen());

function esSearch(startDate, endDate, query) {
    return client.search({
        body: {
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


dialog.matches('show_log_messages', [
    (session, args, next) => {
        var logLevel = builder.EntityRecognizer.findEntity(args.entities, 'log_level');
        if (logLevel) {
            return next({ response: logLevel.entity });
        } else {
            builder.Prompts.text(session, 'What log level?');
        }
    },
    (session, results) => {
        let request = esSearch("now-12h", "now", "Level: Warning");
        request.then(function (resp) {
            session.send(`Total matches: ${resp.hits.total}`);
            if (resp.hits.total > 0) {
                const toShow = Math.min(5, resp.hits.total);
                session.send(`First ${toShow} matches:`);
                for (let el of resp.hits.hits.slice(0, toShow)) {
                    session.send(el["_source"]["RenderedMessage"]);
                }
            }
        })
        session.send(`querying requested data...`);
    }
]);

dialog.onDefault(builder.DialogAction.send("I don't understand."));