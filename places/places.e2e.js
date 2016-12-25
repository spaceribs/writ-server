'use strict';

var jsf = require('json-schema-faker');
var models = require('../models');
var supertest = require('supertest');
var mocks = require('../app/app.mock');
var util = require('../test/util');

var Users = require('../users/users.db.mock');
var Places = require('../places/places.db.mock');
var Passages = require('../passages/passages.db.mock');

describe('Places Endpoint', function() {

    var app;
    var newPlace;
    var places;
    var passages;
    var users;

    beforeAll(mocks.enable);
    afterAll(mocks.disable);

    beforeAll(function() {
        app = require('../app/app');
    });

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

    describe('"/place/" OPTIONS', function() {

        it('should return the JSON schema for places.',
            function(done) {
                supertest(app)
                    .options('/place/')
                    .expect('Content-Type', /json/)
                    .expect(function(res) {
                        expect(res.body).toEqual(models.io.place);
                    })
                    .expect(200)
                    .end(util.handleSupertest(done));
            });

    });

    describe('"/place/" GET', function() {

        it('should return an error when ' +
            'you don\'t authenticate.', function(done) {
            supertest(app)
                .get('/place/')
                .expect(401)
                .end(util.handleSupertest(done));

        });

        it('should return a list of owned places ' +
            'when basically authenticated.', function(done) {
            supertest(app)
                .get('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Owned places found.',
                        data   : jasmine.any(Array),
                        links  : jasmine.any(Array)
                    });
                    expect(res.body.data[0].owner)
                        .toBe(users.verifiedUser._id);

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch('/place/');

                    expect(res.body.links[1].rel)
                        .toBe('author');
                    expect(res.body.links[1].href)
                        .toMatch(users.verifiedUser.id);
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

        it('should return an error if ' +
            'you don\'t own any places.', function(done) {
            supertest(app)
                .get('/place/')
                .auth(
                    users.newUser.email,
                    users.newUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'PLACES_NOT_FOUND',
                        message: 'You do not own any places.'
                    });
                })
                .expect(404)
                .end(util.handleSupertest(done));

        });

        it('should return more information ' +
            'when authenticated as an admin.', function(done) {
            supertest(app)
                .get('/place/')
                .auth(users.adminUser.email, users.adminUser.password)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Owned places found.',
                        data   : jasmine.any(Array),
                        links  : jasmine.any(Array)
                    });
                    expect(res.body.data[0].created)
                        .toBeDefined();
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

    });

    describe('"/place/" POST', function() {

        it('should return an error when ' +
            'you don\'t authenticate.', function(done) {
            supertest(app)
                .post('/place/')
                .expect(401)
                .end(util.handleSupertest(done));

        });

        it('should return an error when trying to ' +
            'create a place without information.', function(done) {
            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status: 'SCHEMA_INVALID',
                        errors: jasmine.any(Object)
                    });
                    expect(res.body.errors.body.length).toBe(5);
                })
                .expect('Content-Type', /json/)
                .expect(400)
                .end(util.handleSupertest(done));
        });

        it('should return an error when ' +
            'the submission doesn\'t match the JSON schema.', function(done) {
            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .send({nope: 'blah', wrong: ':('})
                .expect('Content-Type', /json/)
                .expect(400)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status: 'SCHEMA_INVALID',
                        errors: jasmine.any(Object)
                    });
                    expect(res.body.errors.body.length).toBe(5);
                })
                .end(util.handleSupertest(done));
        });

        it('should return an error when ' +
            'the new place position is ' +
            'the same as another room.', function(done) {
            newPlace.pos = {x: 0, y: 0, z: 0};

            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .send(newPlace)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'PLACE_INVALID',
                        message: 'A place already exists ' +
                        'in this location.'
                    });
                })
                .expect(400)
                .end(util.handleSupertest(done));
        });

        it('should return an error when ' +
            'the new above ground place ' +
            'isn\'t supported by a room above it.', function(done) {
            newPlace.pos = {x: 1, y: -1, z: 3};

            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .send(newPlace)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'PLACE_INVALID',
                        message: 'You cannot add a place above ' +
                        'ground level without a place below it.'
                    });
                })
                .expect(400)
                .end(util.handleSupertest(done));
        });

        it('should return an error when ' +
            'the new below ground place ' +
            'isn\'t supported by a room above it.', function(done) {
            newPlace.pos = {x: 1, y: -1, z: -3};

            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .send(newPlace)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'PLACE_INVALID',
                        message: 'You cannot add a place underground ' +
                        'without a place above it.'
                    });
                })
                .expect(400)
                .end(util.handleSupertest(done));
        });

        it('should return success when ' +
            'the new place submission is valid.', function(done) {
            newPlace.pos = {x: 1, y: -1, z: 0};

            supertest(app)
                .post('/place/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .send(newPlace)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Created new place.',
                        data   : {
                            id: jasmine.any(String)
                        },
                        links  : jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch('/place/');

                    expect(res.body.links[1].rel)
                        .toBe('created');
                    expect(res.body.links[1].href)
                        .toMatch(res.body.data.id);
                })
                .expect(200)
                .end(util.handleSupertest(done));
        });

    });

    describe('"/place/list" GET', function() {

        it('should return an error when ' +
            'you don\'t authenticate.', function(done) {
            supertest(app)
                .get('/place/list/')
                .expect(401)
                .end(util.handleSupertest(done));

        });

        it('should return an error when ' +
            'authenticated without admin privileges.', function(done) {
            supertest(app)
                .get('/place/list/')
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect('Content-Type', /json/)
                .expect(403)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'FORBIDDEN',
                        message: 'Your account is not allowed to ' +
                        'access this endpoint.'
                    });
                })
                .end(util.handleSupertest(done));

        });

        it('should return a list of places ' +
            'when authenticated as an admin.', function(done) {
            supertest(app)
                .get('/place/list/')
                .auth(
                    users.adminUser.email,
                    users.adminUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        'total_rows': jasmine.any(Number),
                        'offset'    : 0,
                        'rows'      : jasmine.any(Array)
                    });
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

    });

    describe('"/place/:placeId" GET', function() {

        it('should return basic information if ' +
            'you are not authenticated', function(done) {
            supertest(app)
                .get('/place/' + places.lobby.id)
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        message: 'Place found.',
                        status : 'SUCCESS',
                        data   : {
                            id: places.lobby.id,
                            owner: users.adminUser._id,
                            name: places.lobby.name,
                            pos: places.lobby.pos,
                            desc: places.lobby.desc,
                            passages: places.lobby.passages,
                            items: places.lobby.items
                        },
                        links  : jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch(places.lobby.id);

                    expect(res.body.links[1].rel)
                        .toBe('author');
                    expect(res.body.links[1].href)
                        .toMatch(users.adminUser._id);
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

        it('should return more information if ' +
            'you are authenticated as an admin', function(done) {
            supertest(app)
                .get('/place/' + places.lobby.id)
                .auth(
                    users.adminUser.email,
                    users.adminUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        message: 'Place found.',
                        status : 'SUCCESS',
                        data   : jasmine.any(Object),
                        links  : jasmine.any(Array)
                    });
                    expect(res.body.data.created)
                        .toBeDefined();
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

    });

    describe('"/place/:placeId" POST', function() {

        it('should not allow anonymous users ' +
            'to make changes to places.', function(done) {
            supertest(app)
                .post('/place/' + places.northRoom.id)
                .send({name: 'Bad Name'})
                .expect(401)
                .end(function() {

                    supertest(app).get('/place/' + places.northRoom.id)
                        .expect('Content-Type', /json/)
                        .expect(function(res) {
                            expect(res.body.data.name).not.toBe('Bad Name');
                        })
                        .expect(200)
                        .end(util.handleSupertest(done));
                });
        });

        it('should allow normal users ' +
            'to make changes to their own places.', function(done) {
            supertest(app)
                .post('/place/' + places.northRoom.id)
                .send({name: 'Good Name'})
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Place has been successfully updated.',
                        data   : jasmine.any(Object),
                        links  : jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch(places.northRoom.id);

                    expect(res.body.links[1].rel)
                        .toBe('author');
                    expect(res.body.links[1].href)
                        .toMatch(users.verifiedUser.id);
                })
                .expect(200)
                .end(function() {

                    supertest(app).get('/place/' + places.northRoom.id)
                        .expect('Content-Type', /json/)
                        .expect(function(res) {
                            expect(res.body.data.name).toBe('Good Name');
                        })
                        .expect(200)
                        .end(util.handleSupertest(done));
                });
        });

        it('should not allow normal users ' +
            'to make changes to admin owned places.', function(done) {
            supertest(app)
                .post('/place/' + places.lobby.id)
                .send({name: 'Bad Name'})
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect('Content-Type', /json/)
                .expect(403)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'FORBIDDEN',
                        message: 'You are not allowed to make these ' +
                        'updates to the room.'
                    });
                })
                .end(function() {

                    supertest(app)
                        .get('/place/' + places.lobby.id)
                        .expect('Content-Type', /json/)
                        .expect(function(res) {
                            expect(res.body.data.name).not.toBe('Bad Name');
                        })
                        .expect(200)
                        .end(util.handleSupertest(done));
                });

        });

        it('should allow admin users ' +
            'to make changes to other users\' places.', function(done) {
            supertest(app)
                .post('/place/' + places.northRoom.id)
                .send({name: 'Good Name'})
                .auth(
                    users.adminUser.email,
                    users.adminUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Place has been successfully updated.',
                        data   : jasmine.any(Object),
                        links  : jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch(places.northRoom.id);

                    expect(res.body.links[1].rel)
                        .toBe('author');
                    expect(res.body.links[1].href)
                        .toMatch(places.northRoom.owner);
                })
                .expect(200)
                .end(function() {

                    supertest(app)
                        .get('/place/' + places.northRoom.id)
                        .expect('Content-Type', /json/)
                        .expect(function(res) {
                            expect(res.body.data.name).toBe('Good Name');
                        })
                        .expect(200)
                        .end(util.handleSupertest(done));
                });

        });

    });

    describe('"/place/:placeId" DELETE', function() {

        it('should not allow anonymous users ' +
            'to delete places.', function(done) {
            supertest(app)
                .delete('/place/' + places.northRoom.id)
                .expect(401)
                .end(function() {

                    supertest(app).get('/place/' + places.northRoom.id)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(util.handleSupertest(done));
                });
        });

        it('should not allow normal users ' +
            'to delete places.', function(done) {
            supertest(app)
                .delete('/place/' + places.lobby.id)
                .auth(
                    users.verifiedUser.email,
                    users.verifiedUser.password
                )
                .expect(403)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'FORBIDDEN',
                        message: 'Your account is not allowed to ' +
                        'access this endpoint.'
                    });
                })
                .end(function() {

                    supertest(app).get('/place/' + places.lobby.id)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(util.handleSupertest(done));
                });
        });

        it('should allow admin users ' +
            'to delete places.', function(done) {
            supertest(app)
                .delete('/place/' + places.northRoom.id)
                .auth(
                    users.adminUser.email,
                    users.adminUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        status : 'SUCCESS',
                        message: 'Place has been deleted.',
                        links: jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch(places.northRoom.id);
                })
                .expect(200)
                .end(function() {

                    supertest(app).get('/place/' + places.northRoom.id)
                        .expect('Content-Type', /json/)
                        .expect(404)
                        .end(util.handleSupertest(done));

                });

        });

    });

    describe('"/place/:placeId/passage" GET', function() {

        it('should return basic information if ' +
            'you are not authenticated.', function(done) {
            supertest(app)
                .get('/place/' + places.lobby.id + '/passage')
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body).toEqual({
                        message: 'Place passages found.',
                        status : 'SUCCESS',
                        data   : {
                            from: jasmine.any(Array),
                            to: jasmine.any(Array)
                        },
                        links  : jasmine.any(Array)
                    });

                    expect(res.body.links[0].rel)
                        .toBe('self');
                    expect(res.body.links[0].href)
                        .toMatch(places.lobby.id);
                    expect(res.body.links[0].href)
                        .toMatch('/passage');

                    expect(res.body.links[1].rel)
                        .toBe('place');
                    expect(res.body.links[1].href)
                        .toMatch(places.lobby.id);
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

        it('should return more information if ' +
            'you are authenticated as an admin.', function(done) {
            supertest(app)
                .get('/place/' + places.lobby.id + '/passage')
                .auth(
                    users.adminUser.email,
                    users.adminUser.password
                )
                .expect('Content-Type', /json/)
                .expect(function(res) {
                    expect(res.body.data.from[0].created)
                        .toBeDefined();
                })
                .expect(200)
                .end(util.handleSupertest(done));

        });

    });

});
