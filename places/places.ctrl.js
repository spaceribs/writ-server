'use strict';

var Promise = require('lie');
var uuid = require('node-uuid');
var _ = require('lodash');
var tv4 = require('tv4');

var models = require('../models');
var Places = require('../places/places.db');
var Passages = require('../passages/passages.db');
var errors = require('../app/app.errors');
var SuccessMessage = require('../app/app.successes').SuccessMessage;
var util = require('../app/app.util');
var databaseErrorHandler = require('../app/app.db.handler.js');

for (var i = 0; i < models.refs.length; i++) {
    tv4.addSchema(models.refs[i]);
}

/**
 * Called when a user makes an OPTIONS request to "/places/".
 * Returns the json-schema used to validate/update places.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placesOptions(req, res, next) {
    if (req.accepts('json')) {
        res.json(models.io.place);
    } else {
        next();
    }
}

/**
 * Called when a user makes an GET request to "/place/".
 * Returns the authenticated users' owned places.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placesGet(req, res, next) {

    Places.createIndex({
        'index': {
            'fields': ['owner']
        }
    }).then(function() {
        return Places.find({
            selector: {
                owner: req.user._id
            }
        });

    }).then(function(results) {
        if (!results.docs || results.docs.length === 0) {
            throw new errors.PlacesNotFoundError(
                'You do not own any places.'
            );
        } else {
            return results.docs;
        }

    }).then(function(places) {
        var filteredPlaces = [];

        for (var i = 0; i < places.length; i++) {
            var filteredPlace = util.dbFilter(
                req.user.permission, 'place', places[i], false, true);
            filteredPlaces.push(filteredPlace);
        }

        return filteredPlaces;

    }).then(function(places) {
        res.json(new SuccessMessage(
            'Owned places found.',
            places, [{
                rel: 'self',
                href: util.getUrl(req)
            }, {
                rel: 'author',
                href: util.getUrl(req, req.user._id)
            }])
        );

    }).catch(function(err) {
        next(err);

    });

}

/**
 * Called when a user makes an POST request to "/place/".
 * Creates a new place for the current user.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 * @returns {boolean|null} - Returns false if validation failed.
 */
function placesPost(req, res, next) {

    var validation = tv4.validateMultiple(req.body, models.io.place);
    if (!validation.valid) {
        next(new errors.JsonSchemaValidationError(
            validation.errors, validation.missing));
        return false;
    }

    var posX = _.get(req, 'body.pos.x');
    var posY = _.get(req, 'body.pos.y');
    var posZ = _.get(req, 'body.pos.z');

    var placeData = req.body;

    Places.createIndex({
        'index': {
            'fields': ['pos.x', 'pos.y', 'pos.z']
        }
    }).then(function() {

        var promises = [
            Places.find({
                selector: {
                    'pos.x': posX,
                    'pos.y': posY,
                    'pos.z': posZ
                },
                limit: 1
            })
        ];

        // Make sure a room exists above or below.
        if (posZ !== 0) {
            promises.push(
                Places.find({
                    selector: {
                        'pos.x': posX,
                        'pos.y': posY,
                        'pos.z': posZ + (posZ < 0 ? 1 : -1)
                    },
                    limit: 1
                })
            );
        }

        return Promise.all(promises);

    }).then(function(results) {

        var exists = results[0];
        var supported = results[1];

        if (exists && _.get(exists, 'docs.length')) {
            throw new errors.PlaceInvalidError(
                'A place already exists in this location.'
            );
        }

        if (supported && !_.get(supported, 'docs.length')) {
            var message = posZ < 0 ?
                'You cannot add a place underground without a place above it.' :
            'You cannot add a place above ground level ' +
            'without a place below it.';

            throw new errors.PlaceInvalidError(message);
        }

    }).then(function() {

        placeData.id = uuid.v4();
        placeData._id = 'place/' + placeData.id;
        placeData.owner = req.user._id;
        placeData.created = new Date().toISOString();
        placeData.updated = new Date().toISOString();

        var validate = tv4.validateMultiple(
            placeData, models.db.place);

        if (!validate.valid) {
            throw new errors.JsonSchemaValidationError(
                validate.errors, validate.missing);
        }

        return Places.put(placeData);

    }).then(function(result) {
        var filtered = util.dbFilter(
            req.user.permission, 'place', result, false, false);

        res.json(
            new SuccessMessage(
                'Created new place.', filtered, [{
                    rel: 'self',
                    href: util.getUrl(req)
                }, {
                    rel: 'created',
                    href: util.getUrl(req, filtered.id)
                }, {
                    rel: 'author',
                    href: util.getUrl(req, placeData.owner)
                }])
        );

    }).catch(function(err) {
        next(err);

    });

    // TODO: Check that a disconnected passage is referenced.
    // TODO: at least one new passage is always submitted with a new place.
}

/**
 * Called when a user makes an GET request to "/place/list/".
 * An admin only list of all places for all users.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 */
function placesList(req, res) {

    Places.allDocs({
        startkey    : 'place/',
        endkey      : 'place/\uffff',
        include_docs: true
    }).then(function(results) {
        for (var i = 0; i < results.rows.length; i++) {
            var row = results.rows[i];
            results.rows[i].doc = util.ioFilter(
                req.user.permission, 'place', row.doc, false, false);
        }
        return results;

    }).then(function(results) {
        res.json(results);

    });

}

/**
 * Called when a user makes an GET request to "/place/:placeId".
 * Gets the details of a specific place.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placeGet(req, res, next) {

    var placeId = 'place/' + req.params.placeId;

    Places.get(placeId)
        .then(function(result) {

            return util.dbFilter(
                req.user.permission, 'place', result, false, false);

        }).then(function(place) {

            res.json(new SuccessMessage(
                'Place found.', place, [{
                    rel: 'self',
                    href: util.getUrl(req)
                }, {
                    rel: 'author',
                    href: util.getUrl(req, place.owner)
                }, {
                    rel: 'passages',
                    href: util.getUrl(req, placeId + '/passages')
                }]));

        }).catch(function() {
            next(new errors.PlaceNotFoundError());
        });

}

/**
 * Called when a user makes an GET request to "/place/:placeId".
 * Updates a specific place.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placePost(req, res, next) {

    var newPlaceData;
    var placeId = 'place/' + req.params.placeId;

    Places.get(placeId)
        .then(function(result) {
            var placeUpdates = util.ioFilter(
                req.user.permission, 'place', req.body, true,
                result.owner === req.user._id);

            if (_.isEmpty(placeUpdates)) {
                throw new errors.ForbiddenError(
                    'You are not allowed to make these updates to the room.');
            }

            newPlaceData = _.extend({}, result, placeUpdates);
            newPlaceData.updated = new Date().toISOString();

            var validate = tv4.validateMultiple(
                newPlaceData, models.db.place);

            if (validate.valid) {
                return Places.put(newPlaceData);
            } else {
                throw new errors.JsonSchemaValidationError(
                    validate.errors, validate.missing
                );
            }

        }).then(function() {
            var placeData = util.ioFilter(
                req.user.permission, 'place',
                newPlaceData, false, req.user._id === newPlaceData.owner);

            res.json(new SuccessMessage(
                'Place has been successfully updated.', placeData, [{
                    rel: 'self',
                    href: util.getUrl(req)
                }, {
                    rel: 'author',
                    href: util.getUrl(req, placeData.owner)
                }]));

        }).catch(function(err) {
            if (err.status === 404) {
                next(new errors.PlaceNotFoundError());
            } else {
                next(err);
            }

        });

}

/**
 * Called when a user makes an DELETE request to "/place/:placeId".
 * Deletes a specific place from the world.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placeDelete(req, res, next) {

    var placeId = 'place/' + req.params.placeId;

    Places.get(placeId).then(function(doc) {
        return Places.remove(doc);

    }).then(function() {
        res.json(new SuccessMessage(
            'Place has been deleted.', undefined, [{
                rel: 'self',
                href: util.getUrl(req)
            }]));

    }).catch(function() {
        next(new errors.PlaceNotFoundError());

    });

}

/**
 * Called when a user makes an GET request to "/place/:placeId/passage/".
 * Gets all passages connected to a place.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {function} next - Callback for the response.
 */
function placePassagesGet(req, res, next) {

    var placeId = 'place/' + req.params.placeId;

    Places.get(placeId)
        .then(function() {

            var fromIndex = Passages.createIndex({
                'index': {
                    'fields': ['from']
                }
            }).catch(databaseErrorHandler('passages'));

            var toIndex = Passages.createIndex({
                'index': {
                    'fields': ['to']
                }
            }).catch(databaseErrorHandler('passages'));

            return Promise.all([
                fromIndex,
                toIndex
            ]);

        }).then(function() {

            var fromPassages = Passages.find({
                selector: {'from': placeId}
            }).catch(databaseErrorHandler('passage'));

            var toPassages = Passages.find({
                selector: {'from': placeId}
            }).catch(databaseErrorHandler('passage'));

            return Promise.all([
                fromPassages,
                toPassages
            ]);

        }).then(function(passageCollections) {
            var filtered = _.map(passageCollections, function(passages) {
                return _.map(passages.docs, function(passage) {
                    return util.dbFilter(req.user.permission, 'passage', passage, false, false);
                });
            });

            res.json(
                new SuccessMessage(
                    'Place passages found.', {
                        from: filtered[0],
                        to: filtered[1]
                    }, [{
                        rel: 'self',
                        href: util.getUrl(req)
                    }, {
                        rel: 'place',
                        href: util.getUrl(req, placeId)
                    }])
            );

        }).catch(function() {
            next(new errors.PlaceNotFoundError());

        });

}

module.exports = {
    places   : {
        options: placesOptions,
        get    : placesGet,
        post   : placesPost,
        list   : placesList
    },
    place    : {
        get     : placeGet,
        post    : placePost,
        delete  : placeDelete,
        passages: {
            get: placePassagesGet
        }
    }
};
