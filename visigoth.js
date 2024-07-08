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
    upstreams$: new BalanceLinkedRing(options.ringSize || 40),
    // 30 seconds by default
    closingTimeout$: closingTimeout || 30000,
    lastChoosenIndex$: -1,
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
  if ((this.lastChoosenIndex$ + 1) % upstreams.length === index) {
    return 10;
  } else {
    return 1;
  }
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
function add (target) {
  const upstream = {};
  // Meta information about the upstream.
  upstream.meta$ = {};
  // Statistics about the upstream. Here is where the user pushes data.
  upstream.meta$.stats = {};
  upstream.meta$.status = 'CLOSED';
  upstream.meta$.statusTimestamp = Date.now();
  upstream.meta$.lastChoosenTimestamp = null;
  upstream.target = target;
  this.upstreams$.push(upstream);
}

/**
 * Removes one upstream from the list.
 */
function remove (upstream) {
  const me = this;
  me.upstreams$ = _.reject(me.upstreams$, function (e) {
    return _.isEqual(e.target, upstream);
  });
}

/**
 * Removes the endpoints by letting the user pass a function that
 * returns true if the node has to be removed.
 */
function removeBy (callback) {
  const me = this;
  me.upstreams$ = _.reject(me.upstreams$, function (e) {
    return callback(e.target);
  });
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
  let bestNode = 0;
  let bestScore = Number.MIN_SAFE_INTEGER;

  _(me.upstreams$).forEach(function (upstream, index) {
    // Re-closing if the timeout has expired;
    if (upstream.meta$.status === 'OPEN') {
      if (Date.now() - upstream.meta$.statusTimestamp > me.closingTimeout$) {
        upstream.meta$.status = 'HALF-OPEN';
        upstream.meta$.statusTimestamp = Date.now();
      }
    }
    const current = me.upstreamRater$(upstream, index, me.upstreams$);
    if (current <= 0) {
      upstream.meta$.status = 'OPEN';
      upstream.meta$.statusTimestamp = Date.now();
    }
    if (current > bestScore && upstream.meta$.status !== 'OPEN') {
      bestScore = current;
      bestNode = index;
    }
  });

  if (bestScore > 0) {
    me.upstreams$[bestNode].meta$.lastChoosenTimestamp = Date.now();
    me.lastChoosenIndex$ = bestNode;

    callback(
      null,
      me.upstreams$[bestNode].target,
      this.failureStrategy$(me.upstreams$[bestNode]),
      me.upstreams$[bestNode].meta$.stats
    );
    // Close the circuit once it has been successful
    if (me.upstreams$[bestNode].meta$.status === 'HALF-OPEN') {
      me.upstreams$[bestNode].meta$.status = 'CLOSED';
      me.upstreams$[bestNode].meta$.statusTimestamp = Date.now();
    }
  } else {
    callback(new Error('no upstreams available'));
  }
}
