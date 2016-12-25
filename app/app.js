'use strict';

var express = require('express');
var passport = require('../users/users.auth');
var bodyParser = require('body-parser');
var app = express();
var ctrl = require('./app.ctrl');

app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

app.get('/', ctrl.get);

app.use(require('../users/users.router'));
app.use(require('../places/places.router'));
app.use(require('../passages/passages.router'));
app.use(require('../middleware/middleware.errors.js'));

module.exports = app;
