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
  this.syncGroups = null
}
util.inherits(LogitechMediaServer, EventEmitter)

// Start listening to the telnet server provided by Logitech Media Server.
// I haven't implemented log in with username/password yet - should be easy to do.
LogitechMediaServer.prototype.start = function() {
  // Listen on this.port to this.address
  this.cli = new CliInterface(this.address, this.port)
  this.cli.listen()

  this.registerEvents()
}

LogitechMediaServer.prototype.registerEvents = function() {
  var self = this
  this.retrievePlayerCount()
  this.cli.on('playerCountChange', function(count) {
    // reset in-memory knowledge of players
    self.numPlayers = count
    self.players = {}

    // Now issue a "player id" request for each player
    for (var i = 0; i < self.numPlayers; i++) {
      self.retrievePlayerMacFromIndex(i)
    }
  })

  this.cli.on('playerLoaded', function(macAddress) {
    self.registerPlayer(macAddress)
  })

  this.cli.on('playerConnected', function(macAddress) {
    self.numPlayers++
    self.registerPlayer(macAddress)
  })

  this.cli.on('playerDisconnect', function(macAddress) {
    delete self.players[macAddress]
    self.numPlayers--
    self.retrieveSyncGroups()
  })

  this.cli.on('syncGroupsChanged', function() {
    self.retrieveSyncGroups()
  })

  this.cli.on('syncGroupsLoaded', function(syncGroups) {
    var playersInGroups = []
    self.syncGroups = []

    if (syncGroups) {
      self.syncGroups = syncGroups
      // group all grouped players so we can determine which arent grouped
      self.syncGroups.forEach(function(group) {
        playersInGroups = playersInGroups.concat(group)
      })
    }

    // all all ungrouped players to their own group
    for(mac in self.players) {
      var player = self.players[mac]
      if (playersInGroups.indexOf(player.mac) === -1) {
        self.syncGroups.push([player.mac])
      }
    }    
    
  })

  this.cli.once('syncGroupsLoaded', function() {
    // Can now start listening for all sorts of things!
    self.startListening()
    self.emit('ready', this)
  })

}

LogitechMediaServer.prototype.retrievePlayerCount = function() {
  this.cli.runCmd('player count ?')
}

LogitechMediaServer.prototype.startListening = function() {
  this.cli.runCmd("listen 1")
}

LogitechMediaServer.prototype.retrievePlayerMacFromIndex = function(index) {
  this.cli.runCmd('player id ' + index +' ?')
}

LogitechMediaServer.prototype.retrieveSyncGroups = function() {
  this.cli.runCmd('syncgroups ?')
}

LogitechMediaServer.prototype.getPlayer = function(macAddress) {
  return this.players[macAddress]
}

LogitechMediaServer.prototype.getSyncGroups = function() {
  return this.syncGroups
}

// Passed a player index and a player MAC address, add to in-memory dictionary of players
LogitechMediaServer.prototype.registerPlayer = function(macAddress) {
  this.players[macAddress] = new Player(this.cli, macAddress)

  // Check whether this is the last player we're waiting for
  if (Object.keys(this.players).length === this.numPlayers) {
    // load SyncGroups
    this.retrieveSyncGroups()
  }
}

module.exports = LogitechMediaServer