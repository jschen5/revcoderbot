//=========================================================
// Bots Dialogs
//=========================================================

var builder = require('botbuilder');
var restify = require('restify');
var weatherClient = require('./wunderground-client');

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

server.post('/', connector.listen());

// var connector = new builder.ConsoleConnector({
//     appId: process.env.MICROSOFT_APP_ID,
//     appPassword: process.env.MICROSOFT_APP_PASSWORD
// }).listen();

var bot = new builder.UniversalBot(connector);
var model = 'https://api.projectoxford.ai/luis/v1/application?id=79bf0f42-0b72-4e09-94e8-28f1c07b2020&subscription-key=d7cd8e8da47c44f296806ff2c7a6873c&q=';
var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);

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
//         session.send('here i would show log messages with loglevel: ' + logLevel.entity);
//     }
// ]);

dialog.onDefault(builder.DialogAction.send("I don't understand."));