var
  net = require('net')
, util = require('util')  
, LineParser = require('./LineParser')
, EventEmitter = require('events').EventEmitter

function CliInterface(address, port) {
  this.address = address
  this.port = port
  this.telnet = null
  this.lineParser = null
  this.knownMacAddresses = []
}
util.inherits(CliInterface, EventEmitter)

function startsWith(search, s) {
  return s.substr(0, search.length) == search
}

CliInterface.prototype.listen = function() {
  this.telnet = net.createConnection(this.port, this.address)
  this.lineParser = new LineParser(this.telnet)

  var self = this
  // The LineParser just emits a "line" event for each line of data
  // that the LMS telnet connection emits
  this.lineParser.on("line", function(data) {
    // Uncomment the next line to see text lines coming back from telnet
    //console.log("< " + data.toString().replace(/\n/g,"\\n"))
    self.handleLine(data)
  })
}

CliInterface.prototype.handle = function(buffer, keyword, callback) {
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

CliInterface.prototype.handle_with_id = function(buffer, keyword) {
  // Similar to .handle, but look for a MAC address:
  // EITHER xx:xx:xx:xx:xx:xx followed by keyword, follwed by data
  // OR     xx:xx:xx:xx:xx:xx followed by data (keyword should be set to null for this)

  // seems as if the telnet server URL encodes things
  var 
    data = decodeURIComponent(buffer.toString())
    returnValue = false

  // step through the known players
  this.knownMacAddresses.forEach(function(mac) {
    if (keyword) {
      // look for (start)(mac) (keyword) (data)(end)
      var m = data.match("^" + mac + "\\s" + keyword + "\\s(.*?)$")
      if (m) {
        returnValue = {mac: mac, params: m[1]}
      }
      // perhaps it's just a line like "00:00:00:00:00:00 stop".  i.e. data is nonexistent
      // look for (start)(mac) (keyword)(end)
      var m = data.match("^" + mac + "\\s" + keyword + "$")
      if (m) {
        returnValue = {mac: mac, params: null}
      }
    } else {
      // look for (start)(mac) (data)(end)
      var m = data.match("^" + mac + "\\s(.*?)$")
      if (m) {
        returnValue = {mac: mac, params: m[1]}
      }
    }
  })

  return returnValue
}

// Called with each line received from the telnet connection, this function looks for
// various commands and acts on them.  Anything unhandled falls out at the bottom
// (currently gets logged to console), except for unhandled stuff that relates to a player.
// Those lines get passed to the player object for handling.
CliInterface.prototype.handleLine = function(buffer) {
  var self = this
  var params = false

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

    this.knownMacAddresses.push(playerMac)

    self.emit('playerLoaded', {index: playerIndex, mac: playerMac})
    return true
  }

  params = self.handle(buffer, "syncgroups")
  if (params || buffer.toString() === 'syncgroups') {
    if (params) {
      params = this.convertParamsToObjects(params, 2)
      var syncGroups = []
      params.forEach(function(param) {
        syncGroups.push(param.sync_members)
      })      
    }
    this.emit('syncGroupsLoaded', syncGroups)
    return true
  }

  // Just handle the "listen" response (LMS should just respond with 'listen 1' at the beginning)
  if (self.handle(buffer, "listen")) {
    return true
  }

  // handle any string received that starts with an id and isn't handled yet
  params = self.handle_with_id(buffer, null)
  if (params) {
    this.handlePlayerCommands(params.mac, params.params)
  } else {
    // anything else, just log to console for now.  Could be an event of its own.
    console.log("unhandled line", decodeURIComponent(buffer.toString()))
  }

}

CliInterface.prototype.handlePlayerCommands = function(mac, cmdString) {

  if (startsWith("mixer volume", cmdString)) {
    var volume = cmdString.match(/^mixer volume\s(.*?)$/)[1]
    this.emit(mac + ' volumeChange', volume)
    return true
  }

  if (startsWith("name", cmdString)) {
    var name = cmdString.match(/^name\s(.*?)$/)[1]
    this.emit(mac + ' nameChange', name)
    return true
  }

  if (startsWith("sync ", cmdString)) {
    this.emit('syncGroupsChanged')
    return true
  }

  console.log('unhandled command: ' + mac + ' ' + cmdString)
}

CliInterface.prototype.convertParamsToObjects = function(params, numKeys) {
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

CliInterface.prototype.runCmd = function(command) {
  this.telnet.writeln(command)
}

// Add a trivial method to the net.Stream prototype object to
// enable debugging during development.  It just appends \n and writes to the stream.
net.Stream.prototype.writeln = function(s) {
  // Uncomment the next line to see data as it's written to telnet
  // console.log("> " + s)
  this.write(s + "\n")
}



module.exports = CliInterface