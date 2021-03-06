var redis = require('redis');
var express =   require("express");
var multer  =   require('multer');
var app         =   express();
var bodyParser  = require('body-parser');
var morgan      = require('morgan');
var jwt    = require('jsonwebtoken'); 
var mysql      = require('mysql');
var md5 = require('md5');
var async=require('async');
var fs = require('fs');
var path = require('path');
var mime = require('mime');
var moment = require('moment');
var server = require('http').Server(app);
var io = require('socket.io')(server);
server.listen(3000,function(){
	console.log("Working on port 3000");
});

var clients =[];

io.sockets.on('connection',function(socket){
	socket.on('storeClientInfo', function (data) {
			console.log('storeClientInfo');			
            var clientInfo = new Object();
            clientInfo.user_id= data.currentSocketUsr.user_id;
            clientInfo.email= data.currentSocketUsr.email;
            clientInfo.firstname= data.currentSocketUsr.firstname;
            clientInfo.lastname= data.currentSocketUsr.lastname;
            clientInfo.clientId= socket.id;
            console.log(clientInfo);
            clients.push(clientInfo);
    });

    socket.on('updateInbox',function(data){
    	   console.log(clients);
    	    console.log(data.followers);	
    	for( var i=0, len=data.followers.length; i<len; ++i ){
    	clients.filter(function(item){
    		
    	if(item.user_id==data.followers[i]){
    		console.log(item.user_id);
    		console.log(data.followers[i]);
    			console.log("found");
    			var clientId=item.clientId;    			
    			io.sockets.connected[clientId].emit('updateInbox', '');
    			//clientId.emit('updateInbox',"");
    		}
    	});


    	}



    });

socket.on('logoff',function(data){
	socket.emit("disconnect","");
});
	socket.on('disconnect', function (data) {
		
		for( var i=0, len=clients.length; i<len; ++i ){
		    var c = clients[i];
		    if(c.clientId == socket.id){
		    	console.log("removed");
		        clients.splice(i,1);
		        break;
		    }
		}
	});
	
	
});

var veyogaConfig=require('./config.json');
var pool      =    mysql.createPool({
    connectionLimit : veyogaConfig.MYSQLConfig.connectionLimit, //important
    host     : veyogaConfig.MYSQLConfig.host,
    user     : veyogaConfig.MYSQLConfig.user,
    password : veyogaConfig.MYSQLConfig.password,
    database : veyogaConfig.MYSQLConfig.database,
    debug    : veyogaConfig.MYSQLConfig.debug
});



app.set('superSecret', 'ilovescotchyscotch');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('dev'));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


var apiRoutes = express.Router(); 

apiRoutes.get('/',function(req,res){
	res.send('Welcome');	
});




apiRoutes.post('/authenticate',function(req,res){
pool.getConnection(function(err,connection){
 if (err) {
          res.json({success: false,"code" : 100, "message" : err});
          return;
        }   
	var username=req.body.username || req.query.username;
	var password=req.body.password || req.query.password;
	password=md5(password);
	connection.query("select user_id,firstname,lastname,email,org_id,role_id from users where email=? and password=?",[username,password],function(err,rows){
    connection.release();
     if (err) {     	
     	res.json({"status":"Failure","code" : 101, "message" : err});
     	return;
     }
	    if(!err) {
	    	if(rows.length==0){
				res.json({success: false,message: 'Username or password did not mactch',code:102});
	    	}
	    	else
	    	{
	    		var token = jwt.sign(rows[0], app.get('superSecret'), {
          			expiresIn: 1440 // expires in 24 hours
        		});
				res.json({success: true,token: token,"code":200,userDetails:rows[0]});

	    	}

	    }


     });

});

});

apiRoutes.use(function(req, res, next) {

  // check header or url parameters or post parameters for token
  var token = req.body.token || req.query.token || req.headers['x-access-token'];

  // decode token
  if (token) {
    // verifies secret and checks exp
    jwt.verify(token, app.get('superSecret'), function(err, decoded) {      
      if (err) {
        return res.json({ success: false, message: 'Failed to authenticate token.',"code":1001 });    
      } else {
        // if everything is good, save to request for use in other routes
        req.decoded = decoded;    
        next();
      }
    });

  } else {
    // if there is no token
    // return an error
    return res.status(403).send({ 
        success: false, 
        message: 'No token provided.' 
    });
    
  }
});

apiRoutes.post('/users',function(req,res){
	var currentUser=req.decoded;

	pool.getConnection(function(err,connection){

 	if (err) 
 	{
      res.json({success: false,"code" : 100, "message" : err});
      return;
    } 

	connection.query("select * from users where org_id=?",[currentUser.org_id],function(err,rows){
	connection.release();
		if (err) {     	
	     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
	     	return;
	     }
	     var obj={success: true,"code":200,"users":rows};
	     res.send(obj);
		});

	});

	
});

apiRoutes.post('/sidenav',function(req,res){
	var currentUser=req.decoded;
	var sidenavTree={"details":[]};
	var sidenav={"sidenav":null};
	pool.getConnection(function(err,connection){
 	if (err) 
 	{
      res.json({success: false,"code" : 100, "message" : err});
      return;
    } 

	connection.query("select team_id,team_name from teams where org_id=?",[currentUser.org_id],function(err,teams){
	if (err) {     	
     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
     	return;
     }
     var itemsProcessed = 0;
     for (var i = 0, len = teams.length; i < len; i++) {
     	
     	connection.query("select pro_id,pro_name from projects where team_id=?",[teams[i].team_id],function(err,projects){
		
		if (err) {     	
	     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
	     	return;
     	}
     	itemsProcessed++;
     	var obj={"team":teams[itemsProcessed-1]};
     	obj["team"]["projects"]=projects;     	
     	sidenavTree.details.push(obj);     	
		if(teams.length==itemsProcessed)
		{			
			sidenav.sidenav=sidenavTree.details;			
			obj={success: true,"code":200,"sidenav":sidenav.sidenav};
			res.send(obj);
		}

		});

     }
	
     

	});

	connection.release();
    });

	//res.send('Success');
});

apiRoutes.post('/getTasks',function(req,res){
	var currentUser=req.decoded;
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    } 
	    var projectID=req.body.projectID;
	    connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name,c.task_name as parent_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id LEFT JOIN tasks as c ON c.task_id=task.parent_id WHERE task.project_id =? and task.completed=0 and task.parent_id=0 order by task.task_priority ASC",[projectID],function(err,tasks){
	    connection.release();
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	obj={success: true,"code":200,"tasks":tasks};
	     	res.send(obj);
     	});

	});

});

apiRoutes.post('/getConversations',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    } 
	    var taskID=req.body.taskID;
	    var coversation={};
	    var followers={};
	    var attachments={};
	    var activityLogs={};
	    var subtasks={};
	    var subtaskParents={"items":[]};
	    var par=1;
async.parallel([
    function(callback) {
       	connection.query("select conv.*,usr.firstname,usr.lastname from conversations as conv LEFT JOIN users as usr  on usr.user_id=conv.created_by where conv.task_id=?",[taskID],function(err,conversationsRow){
	    
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}	     	
	     	
	     	coversation=conversationsRow;
	     	callback(null, '');
     	});
        
        
    },
    function(callback) {
       	connection.query("select user.user_id,user.firstname,user.lastname,user.email from followers as follow INNER JOIN users as user ON user.user_id=follow.user_id where follow.task_id=?",[taskID],function(err,followersRow){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	followers=followersRow;
	     	callback(null, '');
     	});
    },

    function(callback) {
       	connection.query("select * from attachments where task_id=?",[taskID],function(err,attachmentsRows){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	attachments=attachmentsRows;	     	
	     	callback(null, '');
     	});
    },

    function(callback) {
       	connection.query("SELECT log.task_id,log.log_by,usr.firstname as logby,log.act_id,act.act_name,log.assigned_to,assignee.firstname as assignee_name,pro.pro_name,log.due_date,log.original_name,log.created_at FROM activity_logs as log LEFT JOIN users as usr on usr.user_id=log.log_by LEFT JOIN activities as act on act.act_id=log.act_id LEFT JOIN users as assignee on assignee.user_id=log.assigned_to LEFT JOIN projects as pro on log.pro_id=pro.pro_id where log.task_id=?",[taskID],function(err,activity_logs){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	activityLogs=activity_logs;	     	
	     	callback(null, '');
     	});
    },


    function(callback) {
       	connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name,c.task_name as parent_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id LEFT JOIN tasks as c ON c.task_id=task.parent_id WHERE task.parent_id =? order by task.task_priority ASC",[taskID],function(err,subtasksRow){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	subtasks=subtasksRow;	
	     	callback(null, '');
     	});
    },

    function(callback) {
       	connection.query("SELECT  * from tasks where task_id=? and parent_id!=0 LIMIT 1",[taskID],function(err,results){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	
			if(results.length!=0){
		     	getParentsDetails(results[0].parent_id);
			}
			else
			{
				callback(null, '');
			}

	     	
     	});

		var getParentsDetails = function(parent_id) {				
			    if (parent_id!=0) {			        
				        connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name,c.task_name as parent_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id LEFT JOIN tasks as c ON c.task_id=task.parent_id WHERE task.task_id =? order by task.task_priority ASC",[parent_id],function(err,results){
						if (err) {     	
					     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
					     	return;
				     	}
				     	console.log("parent_id: "+parent_id);
				     	console.log(results);
				     	subtaskParents.items.push(results[0]);
				     	return getParentsDetails(results[0].parent_id);
		     		});
			    } else {
			    	callback(null, '');
			    }
			};

    }

],
// optional callback
function(err, results) {
    
	connection.release();
    obj={"coversation":coversation,"followers":followers,"attachments":attachments,'activityLogs':activityLogs,"subtasks":subtasks,"subtaskParents":subtaskParents.items,success: true};
    res.send(obj);

});

	});

});


apiRoutes.post('/myTasks',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
	    connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name,c.task_name as parent_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id LEFT JOIN tasks as b ON b.task_id=task.section_id LEFT JOIN tasks as c ON c.task_id=task.parent_id where task.assignee =? and task.completed=0",[currentUser.user_id],function(err,myTasksRow){
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
		     	return;
	     	}
	     	  var obj={"myTasks":myTasksRow,success: true,"code" : 200};
	    		res.send(obj);

	     });

	}); 

});

apiRoutes.post('/updateDueDate',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }

	    if(!req.body.isUpdateTaskRepeat){

	    connection.query("UPDATE tasks SET due_on=? where task_id=?",[req.body.due_on,req.body.taskID],function(err,tasks){
		
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	var act_id;
	     	var due_on;
	     	if(req.body.isDueDateRemoved=='true'){
	     		act_id=9;
	     		due_on=req.body.old_due_on;
	     	}
	     	else
	     	{
	     		act_id=4;
	     		due_on=req.body.due_on;
	     	}

	     	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	     	connection.query("INSERT INTO activity_logs SET ?",{task_id:req.body.taskID,act_id:act_id,log_by:currentUser.user_id,created_at:created_at,due_date:due_on},function(err,row){
	     	connection.release();
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
	     	});
	     	
			var obj={"code":200,success:true};
			res.send(obj);

	     });

		}
		else{

			var query = 'UPDATE tasks SET repeat_type = ?,repeat_interval = ?, monthly_on =?, weekly_on =? WHERE task_id=?';
			connection.query(query,[req.body.repeat_type,req.body.repeat_interval,req.body.monthly_on,req.body.weekly_on,req.body.taskID],function(err,tasks){
			connection.release();
				if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
		     	var obj={"code":200,success:true};
				res.send(obj);

			});
		}

	}); 

});

apiRoutes.post('/updateAssignee',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
	    connection.query("UPDATE tasks SET assignee=? where task_id=?",[req.body.assignee,req.body.taskID],function(err,tasks){
		
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	
	     	var obj;
	     	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	     	if(req.body.isAssigneeRemoved=='true'){
	     		
	     		obj={task_id:req.body.taskID,act_id:8,log_by:currentUser.user_id,created_at:created_at,assigned_to:req.body.unAssignedFrom}
	     	}
	     	else
	     	{	     		
	     		obj={task_id:req.body.taskID,act_id:2,log_by:currentUser.user_id,created_at:created_at,assigned_to:req.body.assignee}
	     	}

	     	
	     	connection.query("INSERT INTO activity_logs SET ?",obj,function(err,row){
	     	connection.release();
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
	     	});

	     	  var obj={"code":200,success:true};
	    		res.send(obj);

	     });

	}); 

});


apiRoutes.post('/logConversation',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
var lastInsertID;
async.series([
	function(callback) {

		connection.query("INSERT INTO conversations SET ?",{text:req.body.message,task_id:req.body.taskID,created_by:currentUser.user_id},function(err,conversations){
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
			return;
		}		  
		lastInsertID=conversations.insertId;
       	connection.query("select * from followers where task_id=? and user_id!=?",[req.body.taskID,currentUser.user_id],function(err,followersRow){    
				if (err) {     	
			     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
			     	return;
		     	}
		     	var itemsProcessed=0;
		     	if(followersRow.length==0){
		     		callback(null,'');
		     	}
		     	for (var i = 0; i < followersRow.length; i++) {
		     		connection.query("INSERT INTO inbox SET?",{user_id:followersRow[i].user_id,task_id:req.body.taskID,conv_id:lastInsertID},function(err,row){
			     	if (err) {     	
				     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
				     	return;
			     		}
			     		
			     		itemsProcessed++;
			     		if(followersRow.length==itemsProcessed){
			     			callback(null,'');	
			     		}
			     		

		     		});
		     	}

	     	});

	     	
		});	    
		
	},
	function(callback) {

		connection.query("SELECT conv.*,usr.firstname,usr.lastname from conversations as conv LEFT JOIN users as usr  on usr.user_id=conv.created_by where conv.conv_id=?",[lastInsertID],function(err,conversations){
		connection.release();
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
			return;
		}
		var obj={success:true,"code":200,"conversations":conversations};
		res.send(obj);
		});
	}

	]);


	}); 

});

apiRoutes.post('/taskFolllowers',function(req,res){
	
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }

async.series([
	function(callback) {

		connection.query("DELETE FROM followers where task_id=?",[req.body.taskID],function(err,row){
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
			return;
		} 
		  callback(null,'');

		});	    
		
	},
	function(callback) {
			var itemsProcessed=0;
			var followers=JSON.parse(req.body.followerData);
			if(followers.length>0)
			{
				var sql = "INSERT INTO followers (user_id, task_id) VALUES ?";

				connection.query(sql,[followers],function(err,row){
					if (err) {     	
						res.json({"status":"Failure","code" : 101, "message" : err,success:false});
						return;
					}			
					callback(null,'');
				});
			}
			else{
				callback(null,'');
			}
			 
	},
	function(callback) {
		   connection.query("select user.user_id,user.firstname,user.lastname,user.email from followers as follow INNER JOIN users as user ON user.user_id=follow.user_id where follow.task_id=?",[req.body.taskID],function(err,followersRow){
	    	connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	    	var obj={success:true,"code":200,"followers":followersRow};
			res.send(obj);
     	});

	}

	]);


	}); 

});

var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
	var dir = './uploads/'+req.body.taskID;
	if (!fs.existsSync(dir)){
	    fs.mkdirSync(dir);
	    callback(null, dir);
	}
	else
	{
		callback(null, dir);
	}
    
  },
  filename: function (req, file, callback) {
  	var datetimestamp = Date.now();
    callback(null, Date.now()+'-'+file.originalname);
    //callback(null, file.originalname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length -1])

  }
});

//var upload = multer({ storage : storage}).single('files');
var upload = multer({storage: storage}).single('file');
//var upload = multer({ storage : storage}).array('files',12);


apiRoutes.post('/saveAttachment',function(req,res){
	var currentUser=req.decoded;
    upload(req,res,function(err) {
        if(err) {
            return res.end("Error uploading file."+err);
        }
        
        //console.log();
        //console.log(req.files.length);
        /*pool.getConnection(function(err,connection){
	        for(i=0;i<req.files.length;i++)
	        {
	        		var itemsProcessed=0;
	        		console.log(req.body.taskID);
	        		console.log(currentUser.user_id);
	        		console.log(req.files[i].filename);
	        		console.log(req.files[i].path);
	        		connection.query("INSERT INTO attachments SET?",{task_id:req.body.taskID,upload_by:currentUser.user_id,file_name:req.files[i].filename,download_url:req.files[i].path},function(err,row){
					if (err) {     	
						res.json({"status":"Failure","code" : 101, "message" : err});
						return;
					}				
					itemsProcessed++;
					if(itemsProcessed==req.files.length)
					{
											

						connection.query("SELECT * from attachments where task_id=?",[req.body.taskID],function(err,rows){
						connection.release();
						if (err) {     	
							res.json({"status":"Failure","code" : 101, "message" : err});
							return;
						}
						var obj={"Success":true,"code":200,"attachments":rows};
						res.send(obj);
						});


					}

					});

	        }
    	});*/

    	pool.getConnection(function(err,connection){

    		connection.query("INSERT INTO attachments SET?",{task_id:req.body.taskID,upload_by:currentUser.user_id,file_name:req.file.filename,download_url:req.file.path,original_name:req.file.originalname,mimetype:req.file.mimetype,file_size:req.file.size},function(err,row){
    		connection.release();	
					if (err) {     	
						res.json({"status":"Failure","code" : 101, "message" : err,success:false});
						return;
					}
					var obj={success:true,"code":200,"attach_id":row.insertId};
					res.send(obj);
					});				
    	});

        //res.end("File is uploaded");
    });
});

apiRoutes.get('/uploadForm',function(req,res){
//res.send('Hello');
      res.sendFile(__dirname + "/index.html");
});


apiRoutes.post('/createTask',function(req,res){
	var currentUser=req.decoded;
	var parent_id
	if(typeof req.body.parent_id!='undefined'){
		parent_id=req.body.parent_id;
	}
	else{
		parent_id=0
	}	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
var lastInsertID;
var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
async.series([
	function(callback) {
		if(req.body.currentTab=='myTasks')
		{

			connection.query("INSERT INTO tasks SET ?",{task_name:req.body.task_name,task_description:req.body.task_description,created_by:currentUser.user_id,project_id:req.body.projectID,task_priority:Date.now(),assignee:currentUser.user_id,is_section:req.body.isSection,parent_id:parent_id,created_at:created_at},function(err,row){
			if (err) {     	
				res.json({"status":"Failure","code" : 101, "message" : err,success:false});
				return;
			}		  
			  lastInsertID=row.insertId;
			  var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
			  connection.query("INSERT INTO followers SET ?",{task_id:lastInsertID,user_id:currentUser.user_id},function(err,row){
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
			  });

			  connection.query("INSERT INTO activity_logs SET ?",{task_id:lastInsertID,act_id:1,log_by:currentUser.user_id,created_at:created_at},function(err,row){
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
			  });
			 
			  callback(null,'');	

			});	

		}
		else
		{
			connection.query("INSERT INTO tasks SET ?",{task_name:req.body.task_name,task_description:req.body.task_description,created_by:currentUser.user_id,project_id:req.body.projectID,task_priority:Date.now(),is_section:req.body.isSection,parent_id:parent_id,created_at:created_at},function(err,row){
			if (err) {     	
				res.json({"status":"Failure","code" : 101, "message" : err,success:false});
				return;
			}		  
			  lastInsertID=row.insertId;
			  var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
			  connection.query("INSERT INTO followers SET ?",{task_id:lastInsertID,user_id:currentUser.user_id},function(err,row){
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
			  });
			  connection.query("INSERT INTO activity_logs SET ?",{task_id:lastInsertID,act_id:1,log_by:currentUser.user_id,created_at:created_at},function(err,row){
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
			  });

			 connection.query("INSERT INTO activity_logs SET ?",{task_id:lastInsertID,act_id:3,log_by:currentUser.user_id,created_at:created_at,pro_id:req.body.projectID},function(err,row){
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
			  });

			  callback(null,'');	

			});
		}
		
	},
	function(callback) {
		connection.query("SELECT task.*,pro.pro_name,pro.pro_id FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id WHERE task.task_id =?",[lastInsertID],function(err,row){
		connection.release();
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
			return;
		}
		var obj={success:true,"code":200,"task":row};
		res.send(obj);
		});
	}

	]);


	}); 

});

apiRoutes.post('/updateTaskName',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
	    connection.query("UPDATE tasks SET task_name=? where task_id=?",[req.body.task_name,req.body.taskID],function(err,tasks){
		
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	     	connection.query("INSERT INTO activity_logs SET ?",{task_id:req.body.taskID,act_id:7,log_by:currentUser.user_id,created_at:created_at,original_name:req.body.old_task_name},function(err,row){
	     	connection.release();
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
	     	});	
	     	  var obj={success:true,"code":200};
	    		res.send(obj);

	     });

	}); 

});

apiRoutes.post('/updateTaskDescription',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
	    connection.query("UPDATE tasks SET task_description=? where task_id=?",[req.body.task_description,req.body.taskID],function(err,tasks){
		
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}

	     	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	     	connection.query("INSERT INTO activity_logs SET ?",{task_id:req.body.taskID,act_id:10,log_by:currentUser.user_id,created_at:created_at,original_name:req.body.old_task_description},function(err,row){
	     	connection.release();
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
	     	});

	     	

	     	  var obj={success:true,"code":200};
	    		res.send(obj);

	     });

	}); 

});

apiRoutes.post('/updateTaskPriority',function(req,res){
	var currentUser=req.decoded;	
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
	    var taskWithPriority=JSON.parse(req.body.tasks);	    
	    var itemsProcessed=0;
	    var sequenceNumber=1;	    	    
	    for(i=0;i<taskWithPriority.length;i++)
	    {
		    connection.query("UPDATE tasks SET  task_priority=?,section_id=? where task_id=?",[sequenceNumber++,taskWithPriority[i].section_id,taskWithPriority[i].task_id],function(err,tasks){
				if (err) {     	
			     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
			     	return;
		     	}
		     		itemsProcessed++;
		     		if(taskWithPriority.length==itemsProcessed)
		     		{		     			
		     			connection.release();
		     	  		var obj={success:true,"code":200};
		    			res.send(obj);
		    		}

		     });
		}

	}); 

});

apiRoutes.get('/download', function(req, res){
	var currentUser=req.decoded;
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }

       	connection.query("select * from attachments where attach_id=?",[req.query.assert_id],function(err,attachmentsRows){
	    connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	var download_url=attachmentsRows[0].download_url;
	     	var original_name=attachmentsRows[0].original_name;
			var file = __dirname+'/'+download_url;
			var filename = path.basename(file);
			var mimetype = mime.lookup(file);  
			res.setHeader('Content-disposition', 'attachment; filename=' + original_name);
			res.setHeader('Content-type', mimetype);
			var filestream = fs.createReadStream(file);
			filestream.pipe(res);
	     	
     	});

	});


});


apiRoutes.post('/deleteAssert', function(req, res){
	var currentUser=req.decoded;
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }

       	connection.query("select * from attachments where attach_id=?",[req.body.assert_id],function(err,attachmentsRows){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	var download_url=attachmentsRows[0].download_url;
	     	var original_name=attachmentsRows[0].original_name;
			var file = __dirname+'/'+download_url;
			fs.unlink(file, function(err){
		           if (err) {     	
				     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
				     	return;
		     		}

						connection.query("delete from attachments where attach_id=?",[req.body.assert_id],function(err,attachmentsRows){
						connection.release();
							if (err) {     	
							res.json({"status":"Failure","code" : 101, "message" : err});
							}

							var obj={success:false,"code":200};
		    				res.send(obj);

						});

	          });


	     	
     	});

	});


});

function taskRepeatCheck(postData,callback){
if(postData.taskStatus==1){

	pool.getConnection(function(err,connection){
	 	if (err){
	      callback(new Error(err));
	    }
	    
	    connection.query("SELECT * from tasks where task_id=? and repeat_type!=0",[postData.taskID],function(err,row){
			if(err){
				callback(new Error(err));
			}
	    	if(row.length!=0){
	    		var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	    		var due_on;
	    		if(row[0].repeat_type==1){ //for daily Task
	    			var due_on=moment(row[0].due_on,"YYYY-MM-DD HH:mm:ss").add(1,'day').format("YYYY-MM-DD HH:mm:ss"); 
	    		}
	    		else if(row[0].repeat_type==2){//for periodically
	    			var due_on=moment(row[0].due_on,"YYYY-MM-DD HH:mm:ss").add(row[0].repeat_interval,'day').format("YYYY-MM-DD HH:mm:ss");
	    		}
	    		else if(row[0].repeat_type==3){//Weekly	    			
	    			var referenceDueOn = moment(row[0].due_on,'YYYY-MM-DD');
	    			var due_on = referenceDueOn.clone().add(row[0].repeat_interval, 'week').weekday(row[0].weekly_on).format("YYYY-MM-DD HH:mm:ss");
	    			//var due_on=moment().add(row[0].repeat_interval, 'week').isoWeekday(row[0].weekly_on).format("YYYY-MM-DD HH:mm:ss");
	    			
	    		}
	    		else if(row[0].repeat_type==4){//Monthly repeat
	    			if(row[0].monthly_on==29){ // End of month
						var currentDate = moment(row[0].due_on,"YYYY-MM-DD HH:mm:ss");
						var futureMonth = moment(currentDate).add(row[0].repeat_interval, 'M');
						var futureMonthEnd = moment(futureMonth).endOf('month');						
						due_on=moment(futureMonthEnd).format("YYYY-MM-DD HH:mm:ss");
	    			}
	    			else{

						var currentDate = moment(row[0].due_on,"YYYY-MM-DD HH:mm:ss");
						var futureMonth = moment(currentDate).add(row[0].repeat_interval, 'M').date(row[0].monthly_on);
						var futureMonthEnd = moment(futureMonth).endOf('month');
						if(currentDate.date() != futureMonth.date() && futureMonth.isSame(futureMonthEnd.format('YYYY-MM-DD'))) {
						futureMonth = futureMonth.add(1, 'd');
						}
						due_on=moment(futureMonth).format("YYYY-MM-DD HH:mm:ss");

	    			}

	    		}
	    		else if(row[0].repeat_type==5){ //Yearly repeat
	    			var due_on=moment(row[0].due_on,"YYYY-MM-DD HH:mm:ss").add(1, 'years').format("YYYY-MM-DD HH:mm:ss");
	    		}
	    		else{
	    			console.log("Not matched");
	    		}


	    		var dataObj={
	    			task_name:row[0].task_name,
	    			task_description:row[0].task_description,
	    			project_id:row[0].project_id,
	    			created_at:created_at,
	    			due_on:due_on,
	    			tags:row[0].tags,
	    			created_by:row[0].created_by,
	    			assignee:row[0].assignee,
	    			task_priority:Date.now(),
	    			is_section:row[0].is_section,
	    			section_id:row[0].section_id,
	    			parent_id:row[0].parent_id,
	    			repeat_type:row[0].repeat_type,
	    			repeat_interval:row[0].repeat_interval,
	    			monthly_on:row[0].monthly_on,
	    			weekly_on:row[0].weekly_on

	    		}
	    		connection.query("INSERT INTO tasks SET ?",dataObj,function(err,row){
	    			if(err){
	    				callback(new Error(err));
	    			}
	    			var lastInertID=row.insertId;
	    			connection.query("SELECT * from followers where task_id=?",[postData.taskID],function(err,followersRow){
		    			if(err){
		    				callback(new Error(err));
		    			}
	    				var followers=[];
	    				for (var i = 0; i < followersRow.length; i++){
	    					var obj=[lastInertID,followersRow[i].user_id];
	    					followers.push(obj);
	    				}	    				
	    				var sql="INSERT INTO followers (task_id, user_id) VALUES ?";
						connection.query(sql,[followers],function(err,row){
							connection.release();
			    			if(err){
			    				callback(new Error(err));
			    			}
			    			callback(null,'');
						});
	    			});


	    		});
	    	}
	    	else{

	    		callback(null,'');
	    	}
	    	
	    });
	    
	});

}
else{
	callback(null,'');
}
	
}

apiRoutes.post('/updateTaskStatus', function(req, res){
	var currentUser=req.decoded;
	var taskStatus=req.body.taskStatus;
	var currentTab=req.body.currentTab;
	var postData={};
	postData.currentUser=currentUser;
	postData.taskStatus=taskStatus;
	postData.currentTab=currentTab;
	postData.taskID=req.body.taskID;
	taskRepeatCheck(postData,function(err,repeatRes){
		if(err){
			res.json({success: false,"code" : 100, "message" : 'Repeat type task having problem'});
	      	return;
		}
var currentDateTime=moment().format("YYYY-MM-DD HH:mm:ss");
pool.getConnection(function(err,connection){

		var tasks={};
		var currentTask={};

	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }

async.series([
	function(callback) {

		connection.query("update tasks set completed=?,completed_at=? where task_id=?",[taskStatus,currentDateTime,req.body.taskID],function(err,row){
		if(err){     	
		     	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     	return;
	     	}
	     	var act_id;
	     	if(taskStatus==1){
	     		act_id=5;
	     	}else{
	     		act_id=6;
	     	}
	     	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	     	connection.query("INSERT INTO activity_logs SET ?",{task_id:req.body.taskID,act_id:act_id,log_by:currentUser.user_id,created_at:created_at},function(err,row){
	     	//connection.release();
	     		if (err) {
	     			res.json({"status":"Failure","code" : 101, "message" : err,success:false});
		     		return;
	     		}
	     	});

	     	callback(null, '');
	     });
		
	},
	function(callback){

		if(currentTab=="myTasks"){

		    connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id LEFT JOIN tasks as b ON b.task_id=task.section_id where task.assignee =? and task.completed=0",[currentUser.user_id],function(err,tasksRow){
			
				if (err) {     	
			     	res.json({"status":"Failure","code" : 101, "message" : err,success: false});
			     	return;
		     	}
		     		tasks=tasksRow;		    		
		    		callback(null, '');
		     });

	     }
	     else
	     {
			    var projectID=req.body.projectID;
				connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id WHERE task.project_id =? and task.completed=0 order by task.task_priority ASC",[projectID],function(err,tasksRow){
				
				if (err) {     	
				 	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
				 	return;
					}					
				    tasks=tasksRow;				    
					callback(null, '');
				});
	     }

	},
	function(callback){

				connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id WHERE task.task_id=? order by task.task_priority ASC",[req.body.taskID],function(err,currentTaskRow){
				
				if (err) {     	
				 	res.json({"status":"Failure","code" : 101, "message" : err,success:false});
				 	return;
					}					
				    currentTask=currentTaskRow;				    
					callback(null, '');
				});

	}
	],
	function(err, results) {
		connection.release();
		var obj={success:true,"code":200,"tasks":tasks,"currentTask":currentTask};
		res.send(obj);
	}

	);


	});

});

});

apiRoutes.post('/myInbox', function(req, res){
	var currentUser=req.decoded;
	pool.getConnection(function(err,connection){
		if (err){
			res.json({success: false,"code" : 100, "message" : err});
			return;
		}
       	var inbox={"inbox":[]};
       	connection.query("SELECT inbox.*,t1.*,t2.task_name as section_name,pro.pro_id,pro.pro_name FROM (SELECT *  FROM  inbox WHERE user_id=? order by created_at DESC ) as inbox LEFT JOIN tasks as t1 on t1.task_id=inbox.task_id LEFT JOIN tasks as t2 on t2.task_id=t1.section_id LEFT JOIN projects as pro on pro.pro_id=t1.project_id group by t1.task_id ORDER BY inbox.created_at  DESC",[currentUser.user_id],function(err,taskDetails){	    
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     		     	
	     	var itemsProcessed=0;

	     	if(taskDetails.length==0){
	     		var obj={success:true,"code":200,"inbox":inbox};
				res.send(obj);
				return;
	     	}

	     	for (var i = 0, len = taskDetails.length; i < len; i++) {
	     		 
				   connection.query("SELECT inb.user_id,conv.*,usr.firstname,usr.lastname  FROM  inbox as inb INNER JOIN conversations as conv on conv.conv_id=inb.conv_id LEFT JOIN users as usr  on usr.user_id=conv.created_by WHERE inb.user_id=? and inb.task_id=? and inb.is_archieve=0 order by conv.created_at ASC",[currentUser.user_id,taskDetails[i].task_id],function(err,conversationsRow){	    
				   	
						if (err) {     	
					     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
					     	return;
				     	}
				     	else
				     	{
				     		if(conversationsRow.length>0)
				     		{
					     		var obj={"taskDetails":taskDetails[itemsProcessed],"unreadComments":conversationsRow};
					     		inbox.inbox.push(obj);
				     		}
				     		itemsProcessed++;
				     		if(taskDetails.length==itemsProcessed){				     				
				     			var obj={success:true,"code":200,"inbox":inbox};
								res.send(obj);
								return;	
				     		}
				     		
				     	}
				     	
			     	});	
				

	     	}
	     	

     	});



	});

});


apiRoutes.post('/archieveMyInbox', function(req, res){
	var currentUser=req.decoded;
	var task_ids=JSON.parse(req.body.task_ids);
	pool.getConnection(function(err,connection){
		if (err){
			res.json({success: false,"code" : 100, "message" : err});
			return;
		}
		var itemsProcessed=0;
		for (var i = 0, len = task_ids.length; i < len; i++) 
		{       	
       	connection.query("UPDATE inbox SET is_archieve=1 WHERE task_id=? and user_id=?",[task_ids[i],currentUser.user_id],function(err,taskDetails){	    
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	itemsProcessed++;
	     	if(task_ids.length==itemsProcessed){	
	     		var obj={success:true,"code":200};
				res.send(obj);
	     	}

     	});
       }



	});

});

apiRoutes.post('/createProject', function(req, res){
	var currentUser=req.decoded;
	pool.getConnection(function(err,connection){
		if (err){
			res.json({success: false,"code" : 100, "message" : err});
			return;
		}
		connection.query("INSERT INTO projects SET ?",{pro_name:req.body.pro_name,pro_description:req.body.pro_description,team_id:req.body.team_id,created_by:currentUser.user_id},function(err,row){
		connection.release();
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	var obj={success:true,"code":200,"project_id":row.insertId};
			res.send(obj);

		});

	});
});


apiRoutes.post('/createTeam', function(req, res){
	var currentUser=req.decoded;
	var teamFollowers=JSON.parse(req.body.team_followers);
	var lastTeamInsertID;
	pool.getConnection(function(err,connection){
		if (err){
			res.json({success: false,"code" : 100, "message" : err});
			return;
		}
		connection.query("INSERT INTO teams SET ?",{team_name:req.body.team_name,team_desc:req.body.team_desc,org_id:currentUser.org_id},function(err,row){
		
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	lastTeamInsertID=row.insertId;	     	
			if(teamFollowers.length>0){
				var teamFollowData=[];
				for(var j=0;j<teamFollowers.length;j++){
					var obj=[lastTeamInsertID,teamFollowers[j]];
					teamFollowData.push(obj);
				}

				var sql = "INSERT INTO team_followres (team_id, user_id) VALUES ?";
				connection.query(sql,[teamFollowData],function(err,row){
					connection.release();
					if (err) {     	
				     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
				     	return;
			     	}
			     	var obj={success:true,"code":200,"team_id":lastTeamInsertID};
					res.send(obj);
					
				});

			}
			else{
				var obj={success:true,"code":200,"team_id":lastTeamInsertID};
				res.send(obj);
			}

		});
	});
});

apiRoutes.post('/createUser', function(req, res){
	var currentUser=req.decoded;
	var user=JSON.parse(req.body.user);
	var pwd=md5(user.pwd);
	var created_at=moment().format("YYYY-MM-DD HH:mm:ss");
	pool.getConnection(function(err,connection){
		if (err){
			res.json({success: false,"code" : 100, "message" : err});
			return;
		}
		connection.query("INSERT INTO users SET ?",{firstname:user.firstName,lastname:user.lastName,email:user.email,password:pwd,org_id:currentUser.org_id,role_id:2,created_at:created_at},function(err,row){
		connection.release();
			if (err) {     	
		     	res.json({success: false,"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	var obj={success:true,"code":200,"user_id":row.insertId};
			res.send(obj);

		});

	});
});


app.use('/api', apiRoutes);


/*io.on('connection', function(socket){
	console.log("here")
  socket.emit('an event', { some: 'data' });
});

/*app.listen(3000,function(){
    console.log("Working on port 3000");
});*/
