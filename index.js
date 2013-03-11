var util = require('util')
var net = require('net')
var EventEmitter = require('events').EventEmitter
var SqueezePlayer = require('./squeezeplayer')

// Add a trivial method to the net.Stream prototype object to
// enable debugging during development.  It just appends \n and writes to the stream.
net.Stream.prototype.writeln = function(s) {
  // Uncomment the next line to see data as it's written to telnet
  // console.log("> " + s)
  this.write(s + "\n")
}

// Parse incoming data stream splitting on \n and emitting "line" events

function LineParser(stream) {
  var self = this
  self.stream = stream
  self.buffer = ""
  self.stream.on("data", function(d) {
    self.parse(d)
  })
}
util.inherits(LineParser, EventEmitter)

LineParser.prototype.parse = function(data) {
  this.buffer += data
  var split = this.buffer.indexOf("\n")
  while (split > -1) {
    this.emit('line', this.buffer.slice(0, split))
    this.buffer = this.buffer.slice(split + 1)
    split = this.buffer.indexOf("\n")
  }
}





// The LogitechMediaServer object is an event emitter with a few properties.
// After creating it, call .start() and wait for the "registration_finished" event.

function LogitechMediaServer(address) {
  this.address = address
  this.players = {}
  this.numPlayers = 0
  this.syncGroups = []
}
util.inherits(LogitechMediaServer, EventEmitter)

LogitechMediaServer.prototype.runCmd = function(cmd) {
  this.telnet.writeln(cmd)
}

// Start listening to the telnet server provided by Logitech Media Server.
// I haven't implemented log in with username/password yet - should be easy to do.
LogitechMediaServer.prototype.start = function() {
  var self = this

  // Listen on port 9090 to self.address
  this.telnet = net.createConnection(9090, this.address)
  this.line_parser = new LineParser(this.telnet)

  // The LineParser just emits a "line" event for each line of data
  // that the LMS telnet connection emits
  this.line_parser.on("line", function(data) {
    // Uncomment the next line to see text lines coming back from telnet
    //console.log("< " + data.toString().replace(/\n/g,"\\n"))
    self.handleLine(data)
  })

  this.initEvents()
}

LogitechMediaServer.prototype.initEvents = function() {
  var self = this

  this.getPlayerCount()
  this.on('playerCountChange', function(count) {
    // reset in-memory knowledge of players
    self.numPlayers = count
    self.players = {}

    // Now issue a "player id" request for each player
    for (var i = 0; i < self.numPlayers; i++) {
      this.runCmd('player id ' + i +' ?')
    }
  })

  this.on('playerLoaded', function(playerDetails) {
    self.registerPlayer(playerDetails.index, playerDetails.mac)
  })

  this.on('syncgroupsLoaded', function() {
    // Can now start listening for all sorts of things!
    this.runCmd("listen 1")
    this.emit('ready')
  })
}

LogitechMediaServer.prototype.getPlayerCount = function() {
  this.runCmd('player count ?')
}

LogitechMediaServer.prototype.getPlayer = function(macAddress) {
  return this.players[macAddress]
}

// Passed a player index and a player MAC address, add to in-memory dictionary of players
LogitechMediaServer.prototype.registerPlayer = function(playerIndex, playerMac) {
  this.players[playerMac] = new SqueezePlayer(this.telnet, playerIndex, playerMac)

  // Check whether this is the last player we're waiting for
  if (Object.keys(this.players).length == this.numPlayers) {
    // load SyncGroups
    this.runCmd('syncgroups ?')
  }
}

LogitechMediaServer.prototype.handle = function(buffer, keyword, callback) {
  // If data starts with keyword, call the callback with the remainder, and return true.
  // Otherwise just return false.
  // e.g. "player count 3\n", "player count" would call the callback with "3"

  // seems as if the telnet server URL encodes things
  var data = decodeURIComponent(buffer.toString())

  // Look for (start of string)(keyword) (data)(end of string)
  var m = data.match("^" + keyword + "\\s(.*?)$")

  if (m) {
    return m[1]
  }
  return false
}

LogitechMediaServer.prototype.handle_with_id = function(buffer, keyword, callback) {
  // Similar to .handle, but look for a MAC address:
  // EITHER xx:xx:xx:xx:xx:xx followed by keyword, follwed by data
  // OR     xx:xx:xx:xx:xx:xx followed by data (keyword should be set to null for this)
  var self = this

  // seems as if the telnet server URL encodes things
  var data = decodeURIComponent(buffer.toString())

  // step through the known players
  for (mac in self.players) {
    var player = self.players[mac]
    if (keyword) {
      // look for (start)(mac) (keyword) (data)(end)
      var m = data.match("^" + player.mac + "\\s" + keyword + "\\s(.*?)$")
      if (m) {
        callback(player, m[1], buffer)
        return true
      }
      // perhaps it's just a line like "00:00:00:00:00:00 stop".  i.e. data is nonexistent
      // look for (start)(mac) (keyword)(end)
      var m = data.match("^" + player.mac + "\\s" + keyword + "$")
      if (m) {
        callback(player, null, buffer)
        return true
      }
    } else {
      // look for (start)(mac) (data)(end)
      var m = data.match("^" + player.mac + "\\s(.*?)$")
      if (m) {
        callback(player, m[1], buffer)
        return true
      }
    }
  }
  return false

}


// Called with each line received from the telnet connection, this function looks for
// various commands and acts on them.  Anything unhandled falls out at the bottom
// (currently gets logged to console), except for unhandled stuff that relates to a player.
// Those lines get passed to the player object for handling.
LogitechMediaServer.prototype.handleLine = function(buffer) {
  var self = this
  var handled = false
  var params = false

  // Guts of this function is pretty much a list of commands and callbacks.
  // Could definitely be made more efficient, or a bit DRYer, but it's just a bunch of string comparisons.

  // "player count" response is what kicks things off in the first place (see .start())
  params = self.handle(buffer, "player count");
  if (params) {
    self.emit('playerCountChange', parseInt(params[0]))
    return true
  }

  // This response is received for each player, so store 'em in memory as a dic
  params = self.handle(buffer, "player id")
  if (params) {
    params = params.split(" ")
    var playerIndex = parseInt(params[0])
    , playerMac = params[1]

    self.emit('playerLoaded', {index: playerIndex, mac: playerMac})
    return true
  }

  params = self.handle(buffer, "syncgroups")
  if (params || buffer.toString() === 'syncgroups') {
    if (params) {
      params = this.convertParamsToObjects(params, 2)
      params.forEach(function(param) {
        self.syncGroups.push(param.sync_members)
      })      
    }
    this.emit('syncgroupsLoaded')
    return true
  }

  // Just handle the "listen" response (LMS should just respond with 'listen 1' at the beginning)
  if (self.handle(buffer, "listen", function() {})) {
    return true
  }

  // ~~~~~~~~~~~~~~ keywords below here are those which are associated with an individual player ~~~~~~~~~~~~~~~~~~


  // if (self.handle_with_id(buffer, "power", function(player, params, b) {
  //   player.setProperty("power", parseInt(params))

  //   if (player.power == 1) {
  //     // Wait a tiny bit while player is powering up and then ask what state the player is in
  //     setTimeout(function() {
  //       player.runTelnetCmd("mode ?")
  //     }, 1500)
  //   } else {
  //     player.setProperty("mode", "off")
  //   }
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "name", function(player, params, b) {
  //   player.setProperty("name", params)
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "current_title", function(player, params, b) {
  //   player.setProperty("current_title", params)
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "mode", function(player, params, b) {
  //   player.setProperty("mode", params) // "play", "stop" or "pause"
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "play", function(player, params, b) {
  //   player.setProperty("mode", "play")
  //   // player has started playing something.  Let's find out what!
  //   player.runTelnetCmd("current_title ?")
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "stop", function(player, params, b) {
  //   player.setProperty("mode", "stop")
  // })) {
  //   handled = true
  // }

  // if (self.handle_with_id(buffer, "pause", function(player, params, b) {
  //   player.setProperty("mode", "pause")
  // })) {
  //   handled = true
  // }

  if (!handled) {
    // handle any string received that starts with an id and isn't handled yet by passing events
    // to the player objects.
    if (!self.handle_with_id(buffer, null, function(player, params, b) {
      player.handleResponse(params, b)
    })) {
      // anything else, just log to console for now.  Could be an event of its own.
      console.log("unhandled line", decodeURIComponent(buffer.toString()))
    }
  }
}

LogitechMediaServer.prototype.convertParamsToObjects = function(params, numKeys) {
  params = params.split(' ')
  var 
    collection = []
    , obj = {}
    , count = 0

  params.forEach(function(param) {
    // split on only first occurence
    param = param.split(':')
    param = [param.shift(), param.join(':')]
    var values = param[1].split(',')
    obj[param[0]] = values
    count++
    if (count === numKeys) {
      collection.push(obj)
      obj = {}
      count = 0
    }
  })
  return collection
}

module.exports = LogitechMediaServer