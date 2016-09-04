var express =   require("express");
var multer  =   require('multer');
var app         =   express();
var bodyParser  = require('body-parser');
var morgan      = require('morgan');
var jwt    = require('jsonwebtoken'); 
app.set('superSecret', 'ilovescotchyscotch');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('dev'));

var apiRoutes = express.Router(); 

var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './uploads');
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + '-' + Date.now());
  }
});
var upload = multer({ storage : storage}).single('userPhoto');

apiRoutes.get('/authenticate',function(req,res){

var user={"username":"muthu"};
var token = jwt.sign(user, app.get('superSecret'), {
          expiresIn: 100 // expires in 24 hours
        });

        res.json({
          success: true,
          message: 'Enjoy your token!',
          token: token
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

apiRoutes.get('/users',function(req,res){

	res.send('Success');
});

apiRoutes.get('/',function(req,res){
//res.send('Hello');
      res.sendFile(__dirname + "/index.html");
});

apiRoutes.post('/api/photo',function(req,res){
    upload(req,res,function(err) {
        if(err) {
            return res.end("Error uploading file."+err);
        }
        res.end("File is uploaded");
    });
});


app.use('/api', apiRoutes);

app.listen(3000,function(){
    console.log("Working on port 3000");
});
