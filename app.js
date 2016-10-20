var restify = require('restify');
var builder = require('botbuilder');

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
var model = 'https://api.projectoxford.ai/luis/v1/application?id=61829164-298a-4135-a5e3-f6a101fe52de&subscription-key=e83cc08ceef042c3aaada69a17cc35e5&q=';
var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);

server.post('/', connector.listen());

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
        session.send('here i would show log messages');
    }
]);

dialog.onDefault(builder.DialogAction.send("I don't understand."));