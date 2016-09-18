'use strict';

var express = require('express');
var passport = require('../users/users.auth');
var bodyParser = require('body-parser');
var app = express();
var successes = require('./app.successes');
var util = require('./app.util');

app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

app.get('/', function(req, res) {
    var config = require('../config.json');

    res.json(
        new successes.SuccessMessage('Welcome to Writ.', {
            lobby: util.getUrl(req, config.lobby)
        }, [
            {
                rel: 'self',
                href: util.getUrl(req)
            },
            {
                rel: 'users',
                href: util.getUrl(req, 'user/')
            },
            {
                rel: 'places',
                href: util.getUrl(req, 'place/')
            },
            {
                rel: 'passages',
                href: util.getUrl(req, 'passage/')
            }
        ])
    );
});

app.use(require('../users/users.router'));
app.use(require('../places/places.router'));
app.use(require('../passages/passages.router'));
app.use(require('../middleware/middleware.errors.js'));

module.exports = app;
