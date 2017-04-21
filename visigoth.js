
module.exports = function(options) {
    var customRater = undefined;
    var closingTimeout = undefined;
    var failureStrategy = undefined;
    if (typeof options !== 'undefined') {
        customRater = options.customRater;
        closingTimeout = options.closingTimeout;
        failureStrategy = options.failureStrategy;
    }

    return {
        // By default, round robin.
        upstreamRater$ : customRater || roundRobin,
        failureStrategy$ : failureStrategy || defaultFailureHandler,
        upstreams$ : [],
        // 30 seconds by default
        closingTimeout$: closingTimeout || 30000,
        lastChoosenIndex$ : -1,
        add : api_add,
        remove : api_remove,
        remove_by: api_remove_by,
        choose : api_choose,
        choose_all: api_choose_all
    };
}

var _ = require("lodash");

/**
 * Round Robin algorithm
 */
function roundRobin(upstream, index, upstreams) {
    if ((this.lastChoosenIndex$ + 1) % upstreams.length == index) {
        return 10;
    } else {
        return 1;
    }
}

function defaultFailureHandler(node) {
    // This function gets called when the user wants to flag an error.
    return function() {
        node.meta$.status = 'OPEN';
        node.meta$.statusTimestamp = Date.now();
    }
}

/**
 * Adds one upstream to the list.
 */
function api_add(target) {
    var upstream = {};
    // Meta information about the upstream.
    upstream.meta$ = {};
    // Statistics about the upstream. Here is where the user pushes data.
    upstream.meta$.stats = {};
    upstream.meta$.status = "CLOSED";
    upstream.meta$.statusTimestamp = Date.now();
    upstream.meta$.lastChoosenTimestamp = null;
    upstream.target = target;
    this.upstreams$.push(upstream);
}

/**
 * Removes one upstream from the list.
 */
function api_remove(upstream) {
    var me = this;
    me.upstreams$ = _.reject(me.upstreams$, function(e) {
        return _.isEqual(e.target, upstream);
    });
}

/**
 * Removes the endpoints by letting the user pass a function that
 * returns true if the node has to be removed.
 */
function api_remove_by(callback) {
    var me = this;
    me.upstreams$ = _.reject(me.upstreams$, function(e) {
        return callback(e.target);
    });
}

/**
 * Choose all the available not opened targets.
 */
function api_choose_all(callback) {
    _(me.upstreams$).forEach(function(upstream, index) {
        if (upstream.meta$.status != "CLOSED") {
            callback(upstream, index);
        }
    });
}

/**
 * This function chooses one upstream based on a score given by a function
 * that the user will pass as a parameter to visigoth. This function will iterate
 * over the upstreams and return the one with a higher score.
 */
function api_choose(callback) {
    var me = this;
    var bestNode = 0;
    var bestScore = Number.MIN_SAFE_INTEGER;

    _(me.upstreams$).forEach(function(upstream, index) {
        // Re-closing if the timeout has expired;
        if (upstream.meta$.status == 'OPEN') {
            if ((Date.now() - upstream.meta$.statusTimestamp) > me.closingTimeout$) {
                upstream.meta$.status = 'HALF-OPEN';
                upstream.meta$.statusTimestamp = Date.now();
            }
        }
        var current = me.upstreamRater$(upstream, index, me.upstreams$);
        if (current <= 0) {
            upstream.meta$.status = 'OPEN';
            upstream.meta$.statusTimestamp = Date.now();
        }
        if (current > bestScore && upstream.meta$.status != "OPEN") {
            bestScore = current;
            bestNode = index;
        }
    });
    
    if (bestScore > 0) {
        me.upstreams$[bestNode].meta$.lastChoosenTimestamp = Date.now();
        me.lastChoosenIndex$ = bestNode;
        
        callback(null, me.upstreams$[bestNode].target, this.failureStrategy$(me.upstreams$[bestNode]), me.upstreams$[bestNode].meta$.stats);
        // Close the circuit once it has been successful
        if (me.upstreams$[bestNode].meta$.status == "HALF-OPEN") {
            me.upstreams$[bestNode].meta$.status = "CLOSED";
            me.upstreams$[bestNode].meta$.statusTimestamp = Date.now();
        }
    } else {
        callback("no upstreams available");
    }
}
