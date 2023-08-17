Event24 is an event management website. It can be used by the various clubs in an institute to organise events.
The users are informed as well as reminded through email. To setup the website locally, follow these steps :

1. Clone the repository
   git clone https://github.com/Kandarp08/Event24.git

2. Install the following packages using the command
   npm install <package_name>

   i. express
   ii. ejs
   iii. dotenv
   iv. mongodb
   v. cookie-parser
   vi. express-session
   vii. body-parser
   viii. multer
   ix. nodemailer
   x. node-cron

3. Create the .env file. See .env.example to know more.

4. Go to cloud.mongodb.com and create a new cluster. Get the uri from Deployment/Database/Connect/Drivers.

5. Create a database "institute_data" and inside it a collection "institutes". Add a document to the collection 
   "institutes" with the following attributes :

   {
        name: <institute name>
        categories: <string array containing names of all the clubs>
        events_id: 1 (Int32)
        events: <empty array>
   }

   This completes the addition of the institute to the database.

6. Create another database "userdata" and inside it a collection "users". Add a document for admin of the institute
   with the following attributes :

   {
        username: <admin username>
        password: <admin password>
        email: <admin email>
        admin: <institute name>
        myevents_id: 1 (Int32)
        myevents: <empty array>
   }

   This completes the registration of the admin. No separate registration is required for the admin.

7. Start the server
   node index.js