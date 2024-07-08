const expect = require('chai').expect;
const sinon = require('sinon');
/* eslint node/handle-callback-err: "warn" */
/* eslint no-unused-expressions: "warn" */

describe('add targets', function () {
  it("should add a target with status 'CLOSED' and set the 'statusTimestamp'", function () {
    const visigoth = require('./visigoth')();
    const clock = sinon.useFakeTimers();

    // Tick some msecs just to avoid 0 which could be a default value.
    clock.tick(110);

    const { e: aR } = visigoth.add('I am a node');

    expect(aR.u.target).to.equal('I am a node');
    expect(visigoth.upstreams$.length).to.equal(1);
    expect(aR.u.meta$.status).to.equal('CLOSED');
    expect(aR.u.meta$.statusTimestamp).to.equal(clock.now);
    clock.restore();
  });

  it('lastChoosenTimestamp should be null if the node was never choosen (just added)', function () {
    const visigoth = require('./visigoth')();
    const { e: aR } = visigoth.add('I am a node');
    expect(aR.u.meta$.lastChoosenTimestamp).to.equal(null);
  });
});

describe('remove targets', function () {
  it('removes a string target', function () {
    const visigoth = require('./visigoth')();
    const { e: aR } = visigoth.add('target 1');
    visigoth.add('target 2');
    const { code } = visigoth.remove(aR);
    expect(visigoth.upstreams$.length).to.equal(1);
    expect(code).to.equal(0);
  });
});

describe('choose target', function () {
  it('chooses a target when there is at least one available', function (done) {
    const visigoth = require('./visigoth')();
    visigoth.add('node one');
    visigoth.choose(function (error, target) {
      expect(error).to.be.null;
      expect(target).to.equal('node one');
      done();
    });
  });

  it('fails when there are no targets', function (done) {
    const visigoth = require('./visigoth')();
    visigoth.choose(function (error, target, errored, stats) {
      expect(error).to.not.be.null;
      expect(target).to.be.undefined;
      expect(errored).to.be.undefined;
      expect(stats).to.be.undefined;
      done();
    });
  });

  it('marks the node as "HALF-OPEN" once the timeout has expired', function (done) {
    const clock = sinon.useFakeTimers();

    const visigoth = require('./visigoth')({ closingTimeout: 300 });

    const { e: aR } = visigoth.add('test target');
    visigoth.add('test target 2');
    visigoth.choose(function (err, target, errored) {
      errored();
    });

    clock.tick(300);
    visigoth.choose(function (err, target) {
      console.log(target);
      expect(target).to.equal('test target 2');
      expect(aR.u.meta$.status).to.equal('OPEN');
      clock.tick(1);
      visigoth.choose(function (err, target) {
        expect(target).to.equal('test target');
        expect(aR.u.meta$.status).to.equal('HALF-OPEN');
        done();
      });
    });
  });
});
