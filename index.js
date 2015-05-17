var http = require('http')
var Bacon = require('baconjs')
var express = require('express')
var app = express()
var ws = require("nodejs-websocket")
var _ = require('underscore')
var moment = require('moment')
var monk = require('monk')('lounas:kabobsy@lounas.apps.avarko.com:11051/lounas')

var input = new Bacon.Bus()
var problems = new Bacon.Bus()

var wsc
function initWs() {
	//wsc = ws.connect('ws://192.168.0.132:3000/ws', () => {
	wsc = ws.connect('ws://lounasflow.herokuapp.com/ws', () => {
	  console.log('connected')
	})

	wsc.on('text', (data) => input.push(JSON.parse(data)))
	wsc.on('error', (error) => problems.error('error ' + error))
	wsc.on('close', (code, reason) => problems.error('close ' + reason))
}

initWs()
problems.onError((err) => {
	if(err.indexOf('close') != -1) {
		setTimeout(() => {
			console.log('reconnect')
			initWs()
		}, 3000)
	}
})

var voteMap = new Map()

input
	.filter((msg) => { return msg.content.indexOf('#vote') != -1 })
   	.map((vote) => { 
		var content = vote.content.replace('#vote','').trim()
		var place = content.split(' ')[0] 

		return {
			place: place,
			user: vote.user
		}
	})
	.flatMap(function(vote) {
		var result = new Bacon.Bus()

		var dbInput = vote
		dbInput.time = moment().format('YYYY-MM-DD')
		monk.get('votes')
			.insert(dbInput)
			.success(() => result.push('saved'))
			.error((err) => result.error(err))

		return result
	})
	.log('vote handled')

input
	.filter((msg) => { return msg.content.indexOf('#menus') != -1 })
	.log('#menus')
	.flatMap(() => {
		var menus = new Bacon.Bus()
		monk
			.get('lunch')
			.find({date: moment().format('YYYY-MM-DD')})
			.success((restaurants) => {
				console.log('monk success')
				_(restaurants).each((restaurant) => {
					menus.push(restaurant)
				})
			})
		return menus 
	})
	.map((restaurant) => {
		var fullMenu = _(restaurant.menu).map((menuItem) => {
			return menuItem.description + 
				_(menuItem.attributes).reduce((memo, attr) => {
					return memo + ', ' + attr[0]
				}, '')
		})
		return {
			name: restaurant.restaurant,
			menu: fullMenu
		}
	})
	.map((menu) => {
		return menu.name + '\n' + 
			_(menu.menu).reduce((memo, food) => 
				{return memo + '\t' + food + '\n'
			}, '')
	})
	.log('menu published')
	.onValue((output) => {
		wsc.sendText(JSON.stringify({content: output}))
	})

/*app.get('/lunch', (req,res) => {	
	monk
		.get('lunch')
		.find({date: moment().format('YYYY-MM-DD')})
		.success((restaurants) => {
			res.send(restaurants)
		})
})*/

app.listen(1337);

console.log('Server running at http://127.0.0.1:1337/');