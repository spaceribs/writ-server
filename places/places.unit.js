'use strict';

var jsf = require('json-schema-faker');
var models = require('../models');
var mocks = require('../app/app.mock');
var uuid = require('node-uuid');
var errors = require('../app/app.errors');
var SuccessMessage = require('../app/app.successes').SuccessMessage;

var Users = require('../users/users.db.mock');
var Places = require('../places/places.db.mock');
var Passages = require('../passages/passages.db.mock');

describe('Places', function() {

    var newPlace;
    var users;
    var places;
    var passages;
    var ctrl;

    var req;
    var res;
    var callback;

    var anonymousUser = {
        name: 'Anonymous User',
        permission: 100,
        anonymous: true
    };

    beforeAll(mocks.enable);
    afterAll(mocks.disable);

    beforeAll(function() {
        ctrl = require('./places.ctrl');
    });

    beforeEach(
        /**
         * Initialize request, response and callbacks for the Express
         * controllers we'll be testing.
         */
        function expressSetup() {

            req = {
                user: anonymousUser,
                accepts: jasmine.createSpy('accepts'),
                get: function() {
                    return 'localhost:1234';
                }
            };

            res = {
                json: jasmine.createSpy('json')
            };

            callback = jasmine.createSpy('callback');

            /*eslint-disable */
            /* istanbul ignore next */
            res.json.and.callFake(function(response) {
                console.error('UNEXPECTED RESPONSE: \n', response);
            });

            /* istanbul ignore next */
            callback.and.callFake(function(err) {
                console.error('UNEXPECTED ERROR: \n', err);
            });
            /*eslint-enable */

        }
    );

    beforeEach(
        /**
         * For each test, create a new set of places for testing.
         *
         * @param {function} done - Called when all users have been set up.
         */
        function placesSetup(done) {

            newPlace = jsf(models.io.place, models.refs);

            Users.mockUsers()
                .then(function(mockUsers) {
                    users = mockUsers;
                    return Places.mockPlaces(users);
                })
                .then(function(mockPlaces) {
                    places = mockPlaces;
                    return Passages.mockPassages(places);
                })
                .then(function(mockPassages) {
                    passages = mockPassages;
                })
                .then(done)
            /*eslint-disable */
                .catch(
            /* istanbul ignore next */
                function(err) {
                    console.error(err.stack);
                });
            /*eslint-enable */


        }
    );

    afterEach(function(done) {

        Users.erase()
            .then(function() {
                return Places.erase();
            })
            .then(done);

    });

    describe('Controller', function() {

        describe('placesOptions()', function() {

            it('returns a json-schema when requesting options.',
                function(done) {
                    req.accepts.and.returnValue(true);

                    res.json.and.callFake(function(response) {
                        expect(req.accepts).toHaveBeenCalled();
                        expect(req.accepts).toHaveBeenCalledWith('json');
                        expect(response)
                            .toEqual(models.io.place);
                        done();
                    });

                    ctrl.places.options(req, res, callback);

                });

            it('passes through if json isn\'t accepted.', function(done) {
                req.accepts.and.returnValue(false);

                callback.and.callFake(function(response) {
                    expect(req.accepts).toHaveBeenCalled();
                    expect(res.json).not.toHaveBeenCalled();
                    expect(response).toBeUndefined();
                    done();
                });

                ctrl.places.options(req, res, callback);
            });
        });

        describe('placesGet()', function() {
            it('returns authenticated users\' owned places.', function(done) {
                req.user = users.verifiedUser;
                ctrl.places.get(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response.data.length).toBe(6);
                    done();
                });

            });

            it('returns a 404 error if there are no places found.',
                function(done) {
                    req.user = users.newUser;
                    ctrl.places.get(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(callback).toHaveBeenCalled();
                        expect(err)
                            .toEqual(jasmine.any(errors.PlacesNotFoundError));
                        done();
                    });

                });

            it('doesn\'t return some information to verified users.',
                function(done) {
                    req.user = users.verifiedUser;
                    ctrl.places.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response.data[0].created).toBeUndefined();
                        done();
                    });
                });

            it('returns more information to admin users.',
                function(done) {
                    req.user = users.adminUser;
                    ctrl.places.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response.data[0].created).toBeDefined();
                        done();
                    });
                });
        });

        describe('placesPost()', function() {
            it('creates a new place owned by the current user.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = {x: 1, y: 2, z: 0};
                    ctrl.places.post(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });
                });

            it('doesn\'t allow a place to be created at an existing position.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = places.lobby.pos;
                    ctrl.places.post(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceInvalidError));
                        done();
                    });
                });

            it('doesn\'t allow a place to be created below ground level ' +
                'without a place above.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = {x: 1, y: 2, z: -1};
                    ctrl.places.post(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceInvalidError));
                        done();
                    });
                });

            it('doesn\'t allow a place to be created above ground level ' +
                'without a place below.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = {x: 1, y: 2, z: 1};
                    ctrl.places.post(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceInvalidError));
                        done();
                    });
                });

            it('creates a new place above ground level if ' +
                'there is a place below.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = {x: 0, y: 1, z: 1};
                    ctrl.places.post(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });
                });

            it('creates a new place below ground level if ' +
                'there is a place above.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPlace;
                    req.body.pos = {x: 0, y: 1, z: -1};
                    ctrl.places.post(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });
                });

            it('doesn\'t create an invalid place.', function(done) {
                req.user = users.verifiedUser;
                newPlace.invalid = true;
                req.body = newPlace;
                req.body.pos = {x: 1, y: 2, z: 0};
                ctrl.places.post(req, res, callback);

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.JsonSchemaValidationError));
                    expect(err.errors[0].message)
                        .toBe('Additional properties not allowed');
                    done();
                });

            });
        });

        describe('placesList()', function() {
            it('lists all places.', function(done) {
                req.user = users.adminUser;
                ctrl.places.list(req, res);

                res.json.and.callFake(function(response) {
                    expect(response)
                        .toEqual({
                            total_rows: 9,
                            offset: 0,
                            rows: jasmine.any(Array)
                        });
                    expect(response.rows.length).toEqual(9);
                    done();
                });
            });
        });

        describe('placeGet()', function() {
            it('gets the details of a specific place.',
                function(done) {
                    req.params = {
                        placeId: places.lobby.id
                    };
                    ctrl.place.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.created).toBeUndefined();
                        done();
                    });
                });

            it('doesn\'t return anything if the place doesn\'t exist',
                function(done) {
                    req.params = {
                        placeId: uuid.v4()
                    };
                    ctrl.place.get(req, res, callback);

                    callback.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                });

            it('gets more information if you are an admin.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        placeId: places.lobby.id
                    };
                    ctrl.place.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.created).toBeDefined();
                        done();
                    });
                });
        });

        describe('placePost()', function() {
            it('allows normal users to make updates ' +
                'to places they own.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    placeId: places.northRoom.id
                };
                req.body = {
                    name: newPlace.name
                };
                ctrl.place.post(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response.data.name)
                        .toBe(newPlace.name);
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });
            });

            it('doesn\'t allow normal users to make changes ' +
                'to rooms they don\'t own.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    placeId: places.lobby.id
                };
                req.body = {
                    name: newPlace.name
                };
                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.ForbiddenError));
                    done();
                });

                ctrl.place.post(req, res, callback);
            });

            it('allows admin users to make changes ' +
                'to rooms they don\'t own.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    placeId: places.lobby.id
                };
                req.body = {
                    name: newPlace.name
                };
                ctrl.place.post(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response.data.name)
                        .toBe(newPlace.name);
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });
            });

            it('allows admin users to change room owners.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    placeId: places.northRoom.id
                };
                req.body = {
                    owner: users.unverifiedUser._id
                };
                ctrl.place.post(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response.data.owner)
                        .toBe(users.unverifiedUser._id);
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });
            });

            it('doesn\'t allow normal users to change ' +
                'room owners.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    placeId: places.northRoom.id
                };
                req.body = {
                    owner: users.unverifiedUser
                };
                ctrl.place.post(req, res, callback);

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.ForbiddenError));
                    done();
                });
            });

            it('doesn\'t update anything if the place doesn\'t ' +
                'exist.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    placeId: uuid.v4()
                };
                req.body = {
                    name: newPlace.name
                };
                ctrl.place.post(req, res, callback);

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.PlaceNotFoundError));
                    done();
                });
            });

            it('doesn\'t update anything if the place ' +
                'is invalid.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    placeId: places.invalidRoom.id
                };
                req.body = {
                    name: newPlace.name
                };
                ctrl.place.post(req, res, callback);

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.JsonSchemaValidationError));
                    done();
                });
            });
        });

        describe('placeDelete()', function() {
            it('deletes a specific place.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    placeId: places.northRoom.id
                };
                ctrl.place.delete(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });
            });

            it('doesn\'t delete anything if the place doesn\'t exist',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        placeId: uuid.v4()
                    };
                    ctrl.place.delete(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });
                });
        });

        describe('placePassagesGet()', function() {
            it('gets the details of a specific place.',
                function(done) {
                    req.params = {
                        placeId: places.lobby.id
                    };
                    ctrl.place.passages.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.created).toBeUndefined();
                        done();
                    });
                });

            it('doesn\'t return anything if the place doesn\'t exist.',
                function(done) {
                    req.params = {
                        placeId: uuid.v4()
                    };
                    ctrl.place.passages.get(req, res, callback);

                    callback.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                });

            it('gets more information if you are an admin.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        placeId: places.lobby.id
                    };
                    ctrl.place.passages.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.from[0].created).toBeDefined();
                        done();
                    });
                });
        });

    });

});
