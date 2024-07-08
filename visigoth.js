const BalanceLinkedRing = require('./balanceLinkedRing.js');

module.exports = function (options) {
  let customRater;
  let closingTimeout;
  let failureStrategy;
  if (typeof options !== 'undefined') {
    customRater = options.customRater;
    closingTimeout = options.closingTimeout;
    failureStrategy = options.failureStrategy;
  }

  return {
    // By default, round robin.
    upstreamRater$: customRater || roundRobin,
    failureStrategy$: failureStrategy || defaultFailureHandler,
    upstreams$: new BalanceLinkedRing(options?.ringSize ?? 40),
    // 30 seconds by default
    closingTimeout$: closingTimeout || 30000,
    add,
    remove,
    removeBy,
    choose,
    chooseAll
  };
};

const _ = require('lodash');

/**
 * Round Robin algorithm
 */
function roundRobin (upstream, index, upstreams) {
  return 1;
}

function defaultFailureHandler (node) {
  // This function gets called when the user wants to flag an error.
  return function () {
    node.meta$.status = 'OPEN';
    node.meta$.statusTimestamp = Date.now();
  };
}

/**
 * Adds one upstream to the list.
 */
function add (target, score = 1) {
  const upstream = {};
  // Meta information about the upstream.
  upstream.meta$ = {};
  // Statistics about the upstream. Here is where the user pushes data.
  upstream.meta$.stats = {};
  upstream.meta$.status = 'CLOSED';
  upstream.meta$.statusTimestamp = Date.now();
  upstream.meta$.lastChoosenTimestamp = null;
  upstream.target = target;
  return this.upstreams$.addScore(score, upstream);
}

/**
 * Removes one upstream from the list.
 */
function remove (upstream) {
  const me = this;
  return me.upstreams$.removeElement(upstream);
}

/**
 * Removes the endpoints by letting the user pass a function that
 * returns true if the node has to be removed.
 */
function removeBy (callback) {
  // const me = this;
  // me.upstreams$ = _.reject(me.upstreams$, function (e) {
  //   return callback(e.target);
  // });
}

/**
 * Choose all the available not opened targets.
 */
function chooseAll (callback) {
  const me = this;
  _(me.upstreams$).forEach(function (upstream, index) {
    if (upstream.meta$.status !== 'CLOSED') {
      callback(upstream, index);
    }
  });
}

/**
 * This function chooses one upstream based on a score given by a function
 * that the user will pass as a parameter to visigoth. This function will iterate
 * over the upstreams and return the one with a higher score.
 */
function choose (callback) {
  const me = this;

  if (me.upstreams$.length === 0) {
    return callback(new Error('no upstreams available'));
  }

  const start = me.upstreams$.getAndStep();
  let upstream = start;
  let con = false;
  do {
    if (upstream.u.meta$.status === 'OPEN') {
      if (Date.now() - upstream.u.meta$.statusTimestamp > me.closingTimeout$) {
        upstream.u.meta$.status = 'HALF-OPEN';
        upstream.u.meta$.statusTimestamp = Date.now();
      } else {
        upstream = me.upstreams$.getAndStep();
        continue;
      }
    }

    const current = me.upstreamRater$(upstream, -1, me.upstreams$);
    if (current <= 0) {
      upstream.u.meta$.status = 'OPEN';
      upstream.u.meta$.statusTimestamp = Date.now();
    }

    if (upstream.u.meta$.status !== 'OPEN') {
      con = true;
      break;
    }

    upstream = me.upstreams$.getAndStep();
  } while (upstream !== start);

  if (con) {
    upstream.u.meta$.lastChoosenTimestamp = Date.now();

    callback(
      null,
      upstream.u.target,
      this.failureStrategy$(upstream.u),
      upstream.u.meta$.stats
    );
    // Close the circuit once it has been successful
    if (upstream.u.meta$.status === 'HALF-OPEN') {
      upstream.u.meta$.status = 'CLOSED';
      upstream.u.meta$.statusTimestamp = Date.now();
    }
  } else {
    callback(new Error('no upstreams available'));
  }
}
