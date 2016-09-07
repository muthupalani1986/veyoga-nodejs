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
var pool      =    mysql.createPool({
    connectionLimit : 100, //important
    host     : 'localhost',
    user     : 'root',
    password : 'password',
    database : 'veyoga',
    debug    :  false
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
        return res.json({ success: false, message: 'Failed to authenticate token.' });    
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
	     	res.json({"status":"Failure","code" : 101, "message" : err});
	     	return;
	     }
	     var obj={"Success":true,"code":200,"users":rows};
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
     	res.json({"status":"Failure","code" : 101, "message" : err});
     	return;
     }
     var itemsProcessed = 0;
     for (var i = 0, len = teams.length; i < len; i++) {
     	
     	connection.query("select pro_id,pro_name from projects where team_id=?",[teams[i].team_id],function(err,projects){
		
		if (err) {     	
	     	res.json({"status":"Failure","code" : 101, "message" : err});
	     	return;
     	}
     	itemsProcessed++;
     	var obj={"team":teams[itemsProcessed-1]};
     	obj["team"]["projects"]=projects;     	
     	sidenavTree.details.push(obj);     	
		if(teams.length==itemsProcessed)
		{			
			sidenav.sidenav=sidenavTree.details;			
			obj={"Success":true,"code":200,"sidenav":sidenav.sidenav};
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
	    connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id  LEFT JOIN tasks as b ON b.task_id=task.section_id WHERE task.project_id =? order by task.task_priority ASC",[projectID],function(err,tasks){
	    connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	res.send(tasks);
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
async.series([
    function(callback) {
       	connection.query("select * from conversations where task_id=?",[taskID],function(err,conversationsRow){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	coversation=conversationsRow;
	     	callback(null, '');
     	});
        
        
    },
    function(callback) {
       	connection.query("select user.user_id,user.firstname,user.lastname,user.email from followers as follow INNER JOIN users as user ON user.user_id=follow.user_id where follow.task_id=?",[taskID],function(err,followersRow){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	followers=followersRow;
	     	callback(null, '');
     	});
    },

    function(callback) {
       	connection.query("select * from attachments where task_id=?",[taskID],function(err,attachmentsRows){
	    
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	attachments=attachmentsRows;	     	
	     	callback(null, '');
     	});
    }
],
// optional callback
function(err, results) {
    
	connection.release();
    obj={"coversation":coversation,"followers":followers,"attachments":attachments};
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
	    connection.query("SELECT task.*,pro.pro_name,pro.pro_id,b.task_name as section_name FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id LEFT JOIN tasks as b ON b.task_id=task.section_id where task.assignee =?",[currentUser.user_id],function(err,myTasksRow){
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	  var obj={"myTasks":myTasksRow};
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
	    connection.query("UPDATE tasks SET due_on=? where task_id=?",[req.body.due_on,req.body.taskID],function(err,tasks){
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	  var obj={"Success":true,"code":200};
	    		res.send(obj);

	     });

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
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	  var obj={"Success":true,"code":200};
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
			res.json({"status":"Failure","code" : 101, "message" : err});
			return;
		}		  
		  lastInsertID=conversations.insertId;
		  callback(null,'');
		

		});	    
		
	},
	function(callback) {

		connection.query("SELECT * from conversations where conv_id=?",[lastInsertID],function(err,conversations){
		connection.release();
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err});
			return;
		}
		var obj={"Success":true,"code":200,"conversations":conversations};
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
			res.json({"status":"Failure","code" : 101, "message" : err});
			return;
		} 
		  callback(null,'');

		});	    
		
	},
	function(callback) {
			var itemsProcessed=0;
			var followers=JSON.parse(req.body.followerData);
			
			var sql = "INSERT INTO followers (user_id, task_id) VALUES ?";

			connection.query(sql,[followers],function(err,row){
				if (err) {     	
					res.json({"status":"Failure","code" : 101, "message" : err});
					return;
				}			
				callback(null,'');
			});
			 
	},
	function(callback) {
		   connection.query("select user.user_id,user.firstname,user.lastname,user.email from followers as follow INNER JOIN users as user ON user.user_id=follow.user_id where follow.task_id=?",[req.body.taskID],function(err,followersRow){
	    	connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	    	var obj={"Success":true,"code":200,"followers":followersRow};
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
						res.json({"status":"Failure","code" : 101, "message" : err});
						return;
					}
					var obj={"Success":true,"code":200,"attach_id":row.insertId};
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
	pool.getConnection(function(err,connection){
	 	if (err) 
	 	{
	      res.json({success: false,"code" : 100, "message" : err});
	      return;
	    }
var lastInsertID;

async.series([
	function(callback) {
		if(req.body.currentTab=='myTasks')
		{
			connection.query("INSERT INTO tasks SET ?",{task_name:req.body.task_name,task_description:req.body.task_description,created_by:currentUser.user_id,project_id:req.body.projectID,task_priority:Date.now(),assignee:currentUser.user_id,is_section:req.body.isSection},function(err,row){
			if (err) {     	
				res.json({"status":"Failure","code" : 101, "message" : err});
				return;
			}		  
			  lastInsertID=row.insertId;
			  connection.query("INSERT INTO followers SET ?",{task_id:lastInsertID,user_id:currentUser.user_id},function(err,row){});
			  callback(null,'');	

			});	

		}
		else
		{
			connection.query("INSERT INTO tasks SET ?",{task_name:req.body.task_name,task_description:req.body.task_description,created_by:currentUser.user_id,project_id:req.body.projectID,task_priority:Date.now(),is_section:req.body.isSection},function(err,row){
			if (err) {     	
				res.json({"status":"Failure","code" : 101, "message" : err});
				return;
			}		  
			  lastInsertID=row.insertId;
			  connection.query("INSERT INTO followers SET ?",{task_id:lastInsertID,user_id:currentUser.user_id},function(err,row){});
			  callback(null,'');	

			});
		}
		
	},
	function(callback) {
		connection.query("SELECT task.*,pro.pro_name,pro.pro_id FROM  tasks AS task LEFT JOIN projects AS pro ON task.project_id = pro.pro_id WHERE task.task_id =?",[lastInsertID],function(err,row){
		connection.release();
		if (err) {     	
			res.json({"status":"Failure","code" : 101, "message" : err});
			return;
		}
		var obj={"Success":true,"code":200,"task":row};
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
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	  var obj={"Success":true,"code":200};
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
		connection.release();
			if (err) {     	
		     	res.json({"status":"Failure","code" : 101, "message" : err});
		     	return;
	     	}
	     	  var obj={"Success":true,"code":200};
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
			     	res.json({"status":"Failure","code" : 101, "message" : err});
			     	return;
		     	}
		     		itemsProcessed++;
		     		if(taskWithPriority.length==itemsProcessed)
		     		{		     			
		     			connection.release();
		     	  		var obj={"Success":true,"code":200};
		    			res.send(obj);
		    		}

		     });
		}

	}); 

});

app.use('/api', apiRoutes);

app.listen(3000,function(){
    console.log("Working on port 3000");
});
