var 
  util = require('util')
, EventEmitter = require('events').EventEmitter
, Player = require('./lib/Player')
, CliInterface = require('./lib/CliInterface')


// The LogitechMediaServer object is an event emitter with a few properties.
// After creating it, call .start() and wait for the "ready" event.

function LogitechMediaServer(address, port) {
  this.cli = null
  this.address = address
  this.port = port
  this.players = {}
  this.numPlayers = 0
  this.syncGroups = []
}
util.inherits(LogitechMediaServer, EventEmitter)

// Start listening to the telnet server provided by Logitech Media Server.
// I haven't implemented log in with username/password yet - should be easy to do.
LogitechMediaServer.prototype.start = function() {
  // Listen on this.port to this.address
  this.cli = new CliInterface(this.address, this.port)
  this.cli.listen()

  this.handleEvents()
}

LogitechMediaServer.prototype.handleEvents = function() {
  var self = this
  this.getPlayerCount()
  this.cli.on('playerCountChange', function(count) {
    // reset in-memory knowledge of players
    self.numPlayers = count
    self.players = {}

    // Now issue a "player id" request for each player
    for (var i = 0; i < self.numPlayers; i++) {
      self.cli.runCmd('player id ' + i +' ?')
    }
  })

  this.cli.on('handlePlayerEvent', function(eventDetails) {
    var 
      macAddress = Object.keys(eventDetails)[0]
    , command = eventDetails[macAddress]

    self.players[macAddress].handleResponse(command)
  })

  this.cli.on('playerLoaded', function(playerDetails) {
    self.registerPlayer(playerDetails.index, playerDetails.mac)
  })

  this.cli.on('syncgroupsLoaded', function() {
    // Can now start listening for all sorts of things!
    self.cli.runCmd("listen 1")
    self.emit('ready')
  })
}

LogitechMediaServer.prototype.getPlayerCount = function() {
  this.cli.runCmd('player count ?')
}

LogitechMediaServer.prototype.getPlayer = function(macAddress) {
  return this.players[macAddress]
}

// Passed a player index and a player MAC address, add to in-memory dictionary of players
LogitechMediaServer.prototype.registerPlayer = function(playerIndex, playerMac) {
  this.players[playerMac] = new Player(this.cli, playerIndex, playerMac)

  // Check whether this is the last player we're waiting for
  if (Object.keys(this.players).length === this.numPlayers) {
    // load SyncGroups
    this.cli.runCmd('syncgroups ?')
  }
}

module.exports = LogitechMediaServer