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

describe('Passages', function() {

    var newPassage;
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
        ctrl = require('./passages.ctrl');
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
         * For each test, create a new set of passages for testing.
         *
         * @param {function} done - Called when all users have been set up.
         */
        function passagesSetup(done) {

            newPassage = jsf(models.io.passage, models.refs);

            /* istanbul ignore next */
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
                .catch(function(err) {
                    console.error(err.stack);
                });
            /*eslint-enable */

        }
    );

    afterEach(function(done) {

        /* istanbul ignore next */
        Users.erase()
            .then(function() {
                return Places.erase();
            })
            .then(function() {
                return Passages.erase();
            })
            .then(done)
        /*eslint-disable */
            .catch(function(err) {
                console.error(err);
            });
        /*eslint-enable */

    });

    describe('Controller', function() {

        describe('passagesOptions()', function() {

            it('returns a json-schema when requesting options.',
                function(done) {
                    req.accepts.and.returnValue(true);

                    res.json.and.callFake(function(response) {
                        expect(req.accepts).toHaveBeenCalled();
                        expect(req.accepts).toHaveBeenCalledWith('json');
                        expect(response)
                            .toEqual(models.io.passage);
                        done();
                    });

                    ctrl.passages.options(req, res, callback);

                });

            it('passes through if json isn\'t accepted.', function(done) {
                req.accepts.and.returnValue(false);

                callback.and.callFake(function(response) {
                    expect(req.accepts).toHaveBeenCalled();
                    expect(res.json).not.toHaveBeenCalled();
                    expect(response).toBeUndefined();
                    done();
                });

                ctrl.passages.options(req, res, callback);
            });

        });

        describe('passagesGet()', function() {
            it('returns authenticated users\' owned passages.', function(done) {
                req.user = users.verifiedUser;
                ctrl.passages.get(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response.data.length).toBe(2);
                    done();
                });

            });

            it('returns a 404 error if there are no passages found.',
                function(done) {
                    req.user = users.unverifiedUser;
                    ctrl.passages.get(req, res, callback);

                    callback.and.callFake(function(err) {
                        expect(callback).toHaveBeenCalled();
                        expect(err)
                            .toEqual(jasmine.any(errors.PassagesNotFoundError));
                        done();
                    });

                });

            it('doesn\'t return some information to verified users.',
                function(done) {
                    req.user = users.verifiedUser;
                    ctrl.passages.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response.data[0].created).toBeUndefined();
                        done();
                    });
                });

            it('returns more information to admin users.',
                function(done) {
                    req.user = users.adminUser;
                    ctrl.passages.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response.data[0].created).toBeDefined();
                        done();
                    });
                });
        });

        describe('passagesPost()', function() {
            it('creates a new passage owned by the current user.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPassage;
                    req.body.from = places.northRoom._id;
                    req.body.to = places.northWestRoom._id;

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t create an invalid passage.', function(done) {
                req.user = users.verifiedUser;
                req.body = newPassage;
                req.body.invalid = true;
                req.body.from = places.northRoom._id;
                req.body.to = places.northWestRoom._id;

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.JsonSchemaValidationError));
                    expect(err.errors[0].message)
                        .toBe('Additional properties not allowed');
                    done();
                });

                ctrl.passages.post(req, res, callback);
            });

            it('doesn\'t allow a passage to be created ' +
                'if the originating place is the same as ' +
                'the destination.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.from = places.lobby._id;
                    req.body.to = places.lobby._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'if the originating place doesn\'t exist.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.from = uuid.v4();
                    req.body.to = places.northWestRoom._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'if the destination place doesn\'t exist.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.from = places.northRoom._id;
                    req.body.to = uuid.v4();

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'where one already exists.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.body = newPassage;
                    req.body.to = places.northRoom._id;
                    req.body.from = places.lobby._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'where a passage exists, but is reversed.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.to = places.lobby._id;
                    req.body.from = places.northRoom._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'if a normal user doesn\'t own the originating place.',
                function(done) {
                    req.user = users.unverifiedUser;
                    req.body = newPassage;
                    req.body.from = places.farNorthEastRoom._id;
                    req.body.to = places.northEastRoom._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.ForbiddenError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'if a normal user doesn\'t own the destination place.',
                function(done) {
                    req.user = users.unverifiedUser;
                    req.body = newPassage;
                    req.body.from = places.northEastRoom._id;
                    req.body.to = places.farNorthEastRoom._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.ForbiddenError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('allows a passage to be created ' +
                'if an admin user doesn\'t own either places.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.from = places.northRoom._id;
                    req.body.to = places.northWestRoom._id;

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be created ' +
                'between places which aren\'t immediately adjacent.',
                function(done) {
                    req.user = users.adminUser;
                    req.body = newPassage;
                    req.body.from = places.lobby._id;
                    req.body.to = places.southWestRoom._id;

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passages.post(req, res, callback);
                });
        });

        describe('passagesList()', function() {
            it('lists all passages.', function(done) {
                req.user = users.adminUser;
                ctrl.passages.list(req, res);

                res.json.and.callFake(function(response) {
                    expect(response)
                        .toEqual({
                            total_rows: 6,
                            offset: 0,
                            rows: jasmine.any(Array)
                        });
                    expect(response.rows.length).toEqual(6);
                    done();
                });
            });
        });

        describe('passageGet()', function() {
            it('gets the details of a specific passage.',
                function(done) {
                    req.params = {
                        passageId: passages.northDoor.id
                    };

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.created).toBeUndefined();
                        done();
                    });

                    ctrl.passage.get(req, res, callback);
                });

            it('doesn\'t return anything if the passage doesn\'t exist',
                function(done) {
                    req.params = {
                        passageId: uuid.v4()
                    };

                    callback.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(errors.PassageNotFoundError));
                        done();
                    });

                    ctrl.passage.get(req, res, callback);
                });

            it('gets more information if you are an admin.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.northDoor.id
                    };
                    ctrl.passage.get(req, res, callback);

                    res.json.and.callFake(function(response) {
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        expect(response.data.created).toBeDefined();
                        done();
                    });
                });
        });

        describe('passagePost()', function() {
            it('allows normal users to make updates ' +
                'to passages they own.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    passageId: passages.farNorthDoor.id
                };
                req.body = {
                    name: newPassage.name
                };

                res.json.and.callFake(function(response) {
                    expect(response.data.name)
                        .toBe(newPassage.name);
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('doesn\'t allow normal users to make changes ' +
                'to passages they don\'t own.', function(done) {
                req.user = users.unverifiedUser;
                req.params = {
                    passageId: passages.farNorthDoor.id
                };
                req.body = {
                    name: newPassage.name
                };

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.ForbiddenError));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('allows admin users to make changes ' +
                'to passages they don\'t own.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    passageId: passages.farNorthDoor.id
                };
                req.body = {
                    name: newPassage.name
                };

                res.json.and.callFake(function(response) {
                    expect(response.data.name)
                        .toBe(newPassage.name);
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('allows admin users to change passage owners.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.farNorthDoor.id
                    };
                    req.body = {
                        owner: users.unverifiedUser._id
                    };

                    res.json.and.callFake(function(response) {
                        expect(response.data.owner)
                            .toBe(users.unverifiedUser._id);
                        expect(response)
                            .toEqual(jasmine.any(SuccessMessage));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow normal users to change ' +
                'passage owners.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    passageId: passages.farNorthDoor.id
                };
                req.body = {
                    owner: users.unverifiedUser._id
                };

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.ForbiddenError));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('doesn\'t update anything if the passage doesn\'t ' +
                'exist.', function(done) {
                req.user = users.verifiedUser;
                req.params = {
                    passageId: uuid.v4()
                };
                req.body = {
                    name: newPassage.name
                };

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.PassageNotFoundError));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('doesn\'t update anything if the passage ' +
                'is invalid.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    passageId: passages.invalidPassage.id
                };
                req.body = {
                    name: newPassage.name
                };

                callback.and.callFake(function(err) {
                    expect(err)
                        .toEqual(jasmine.any(errors.JsonSchemaValidationError));
                    done();
                });

                ctrl.passage.post(req, res, callback);
            });

            it('doesn\'t allow a passage to be updated ' +
                'if the originating place is the same as ' +
                'the destination.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.northDoor.id
                    };
                    req.body = {
                        from: places.lobby._id,
                        to: places.lobby._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'if the originating place doesn\'t exist.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.northDoor.id
                    };
                    req.body = {
                        from: 'places/' + uuid.v4(),
                        to: places.northWestRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'if the destination place doesn\'t exist.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.northDoor.id
                    };
                    req.body = {
                        to: 'places/' + uuid.v4(),
                        from: places.northWestRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PlaceNotFoundError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'if you do not own the originating place.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.params = {
                        passageId: passages.farNorthDoor.id
                    };
                    req.body = {
                        from: places.northEastRoom._id,
                        to: places.farNorthEastRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.ForbiddenError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'if you do not own the destination place.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.params = {
                        passageId: passages.farNorthDoor.id
                    };
                    req.body = {
                        from: places.farNorthEastRoom._id,
                        to: places.northEastRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.ForbiddenError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'between places which aren\'t immediately adjacent.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.northDoor.id
                    };
                    req.body = {
                        from: places.lobby._id,
                        to: places.southWestRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'where one already exists.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.params = {
                        passageId: passages.northEastDoor.id
                    };
                    req.body = {
                        from: places.northRoom._id,
                        to: places.farNorthRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow a passage to be updated ' +
                'where a passage exists, but is reversed.',
                function(done) {
                    req.user = users.verifiedUser;
                    req.params = {
                        passageId: passages.northEastDoor.id
                    };
                    req.body = {
                        from: places.farNorthRoom._id,
                        to: places.northRoom._id
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageInvalidError));
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

            it('doesn\'t allow an invalid passage to be updated.',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: passages.invalidPassage.id
                    };
                    req.body = {
                        name: 'blah'
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(
                                jasmine.any(errors.JsonSchemaValidationError)
                            );
                        done();
                    });

                    ctrl.passage.post(req, res, callback);
                });

        });

        describe('passageDelete()', function() {
            it('deletes a specific passage.', function(done) {
                req.user = users.adminUser;
                req.params = {
                    passageId: passages.northDoor.id
                };

                ctrl.passage.delete(req, res, callback);

                res.json.and.callFake(function(response) {
                    expect(response)
                        .toEqual(jasmine.any(SuccessMessage));
                    done();
                });
            });

            it('doesn\'t delete anything if the passage doesn\'t exist',
                function(done) {
                    req.user = users.adminUser;
                    req.params = {
                        passageId: uuid.v4()
                    };

                    callback.and.callFake(function(err) {
                        expect(err)
                            .toEqual(jasmine.any(errors.PassageNotFoundError));
                        done();
                    });

                    ctrl.passage.delete(req, res, callback);
                });
        });

    });

});
