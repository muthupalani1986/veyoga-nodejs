var express    = require("express");
var mysql      = require('mysql');

var pool      =    mysql.createPool({
    connectionLimit : 100, //important
    host     : 'localhost',
    user     : 'root',
    password : 'password',
    database : 'asana',
    debug    :  false
});


var app = express();
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var server = require('http').Server(app);
var io = require('socket.io')(server);

var redis = require('redis');
var redisClient = redis.createClient({host : 'localhost', port : 6379});

redisClient.on('ready',function() {
 console.log("Redis is ready");
});

redisClient.on('error',function() {
 console.log("Error in Redis");
});


redisClient.set("language","nodejs",function(err,reply) {
 console.log(err);
 console.log(reply);
});

redisClient.get("language",function(err,reply) {
 console.log(err);
 console.log(reply);
});

var obj={"user":[{"id":"1","name":"A"},{"id":"2","name":"B"},{"id":"3","name":"C"}],"test":"KK"}
redisClient.set("testing",JSON.stringify(obj),redis.print);

redisClient.get("testing",function(err,reply) {
    console.log(JSON.parse(reply));
});

function handle_database(req,res) {
    
    pool.getConnection(function(err,connection){
        if (err) {
          res.json({"code" : 100, "status" : "Error in connection database"});
          return;
        }   

        console.log('connected as id ' + connection.threadId);
        
        redisClient.get("users",function(err,reply) {
            if(reply==null)
            {
            connection.query("select * from users",function(err,rows){
                connection.release();
                if(!err) {
                    res.json(rows);
                    
                    redisClient.set('users', JSON.stringify(rows), redis.print);
                }           
            });

            }
            else
            {
                redisClient.get("users",function(err,reply) {
                   var reply= JSON.parse(reply);
                    res.json(reply);
                });
                
            }
        });



        connection.on('error', function(err) {      
              res.json({"code" : 100, "status" : "Error in connection database"});
              return;     
        });
  });
}

app.get("/",function(req,res){-
        handle_database(req,res);
});


io.sockets.on('connection', function (socket) {

    socket.on('message', function (message) {
        console.log("Got message: " + message);
        socket.broadcast.emit('pageview', { 'url': message });
    });

});

//app.listen(4000);
server.listen(4000)
