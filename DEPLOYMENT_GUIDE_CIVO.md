# Deployment Guide: Hostel Management Backend on Civo

Complete step-by-step guide to deploy your Node.js backend on Civo cloud server.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Create Civo Account & Instance](#step-1-create-civo-account--instance)
3. [Step 2: Connect to Your Instance](#step-2-connect-to-your-instance)
4. [Step 3: Install Dependencies](#step-3-install-dependencies)
5. [Step 4: Clone & Setup Project](#step-4-clone--setup-project)
6. [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
7. [Step 6: Setup PM2 Process Manager](#step-6-setup-pm2-process-manager)
8. [Step 7: Setup Nginx Reverse Proxy](#step-7-setup-nginx-reverse-proxy)
9. [Step 8: Setup SSL Certificate](#step-8-setup-ssl-certificate)
10. [Step 9: Setup Firewall Rules](#step-9-setup-firewall-rules)
11. [Step 10: Domain & DNS Setup](#step-10-domain--dns-setup)
12. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Prerequisites

- Civo account (create at https://www.civo.com)
- SSH client (built-in on Linux/Mac, PuTTY on Windows)
- Git installed locally
- Your backend code pushed to GitHub
- MongoDB Atlas account with connection string
- Cloudinary account credentials
- Domain name (optional but recommended)

---

## Step 1: Create Civo Account & Instance

### 1.1 Sign Up
- Go to https://www.civo.com/sign-up
- Create account and verify email

### 1.2 Create Instance
1. Login to Civo dashboard
2. Click **"Instances"** → **"Create Instance"**
3. **Configure Instance:**
   - **Region:** Choose closest to your users (e.g., London, Singapore)
   - **Instance Type:** Select **"Small" or "Medium"**
     - Small: 1GB RAM, 1 vCPU (~$0.006/hour)
     - Medium: 2GB RAM, 2 vCPU (~$0.017/hour)
   - **OS:** Ubuntu 22.04 LTS
   - **Initial Configuration:** None required initially
   - **Firewall:** Create new firewall (we'll configure later)

4. **Add SSH Key:**
   - Click **"New SSH Key"**
   - Paste your public SSH key (or generate one)
   ```bash
   # Generate SSH key on your local machine
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/civo_key
   cat ~/.ssh/civo_key.pub  # Copy this to Civo
   ```

5. **Create Instance** and wait for it to boot (usually 30-60 seconds)

### 1.3 Note Your Instance Details
- **Hostname:** `api.example.com` or similar
- **IP Address:** `XXX.XXX.XXX.XXX`
- **SSH Port:** 22 (default)

---

## Step 2: Connect to Your Instance

### 2.1 SSH Connection

**From Linux/Mac:**
```bash
ssh -i ~/.ssh/civo_key root@<YOUR_INSTANCE_IP>
```

**From Windows (PowerShell):**
```powershell
ssh -i C:\Users\YourName\.ssh\civo_key root@<YOUR_INSTANCE_IP>
```

**First Time Connection:**
Accept the fingerprint when prompted:
```
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
```

### 2.2 Verify Connection
```bash
echo "Connected successfully"
whoami  # Should print: root
```

---

## Step 3: Install Dependencies

### 3.1 Update System
```bash
sudo apt update
sudo apt upgrade -y
```

### 3.2 Install Node.js & npm
```bash
# Install Node.js 18 (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 3.3 Install Git
```bash
sudo apt install -y git
git --version
```

### 3.4 Install Other Tools
```bash
# PM2 (process manager)
sudo npm install -g pm2

# Nginx (reverse proxy)
sudo apt install -y nginx

# UFW (firewall - optional but recommended)
sudo apt install -y ufw

# Certbot (SSL certificates)
sudo apt install -y certbot python3-certbot-nginx
```

### 3.5 Verify All Installations
```bash
pm2 --version
nginx -v
certbot --version
```

---

## Step 4: Clone & Setup Project

### 4.1 Create Application Directory
```bash
# Create app directory
mkdir -p /var/www/hostel-management-api
cd /var/www/hostel-management-api
```

### 4.2 Clone Repository from GitHub
```bash
# Replace with your GitHub repository URL
git clone https://github.com/jagadeesh520/Hostel-Management-BE.git .

# Verify contents
ls -la
```

### 4.3 Install Dependencies
```bash
npm install

# This installs all packages from package.json
```

### 4.4 Verify Installation
```bash
npm list | head -20
```

---

## Step 5: Configure Environment Variables

### 5.1 Create .env File
```bash
nano .env
```

### 5.2 Add Configuration
```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/hostel-management?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_change_this

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional: Other configurations
ENVIRONMENT=production
LOG_LEVEL=info
```

**Important:**
- Replace all placeholders with actual values
- Keep JWT_SECRET secure and complex
- Get Cloudinary credentials from https://cloudinary.com/console
- Get MongoDB URI from MongoDB Atlas

### 5.3 Save File
```bash
# Press Ctrl+X, then Y, then Enter
```

### 5.4 Verify .env File
```bash
cat .env
```

### 5.5 Set Proper Permissions
```bash
chmod 600 .env  # Only owner can read/write
```

---

## Step 6: Setup PM2 Process Manager

### 6.1 Start Application with PM2
```bash
pm2 start server.js --name "hostel-api"

# Or with specific configuration
pm2 start server.js --name "hostel-api" --instances max
```

### 6.2 Monitor Application
```bash
pm2 status
pm2 logs hostel-api
```

### 6.3 Enable Auto-Start on Reboot
```bash
# Generate startup script
pm2 startup systemd -u root --hp /root

# Save PM2 process list
pm2 save
```

### 6.4 Verify Auto-Start is Enabled
```bash
systemctl status pm2-root
```

### 6.5 Test Application (Should see "Hostel Management API is running")
```bash
curl http://localhost:5000
```

---

## Step 7: Setup Nginx Reverse Proxy

### 7.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/hostel-api
```

### 7.2 Add Nginx Configuration
```nginx
server {
    listen 80;
    server_name api.example.com;  # Replace with your domain or IP
    
    # Client body size limit for file uploads (500MB)
    client_max_body_size 500M;
    
    # Proxy settings
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
    
    # Static files (uploads, tv-display)
    location /uploads/ {
        alias /var/www/hostel-management-api/uploads/;
        expires 30d;
    }
    
    location /tv-display/ {
        alias /var/www/hostel-management-api/public/tv-display/;
        expires 7d;
    }
}
```

### 7.3 Enable Configuration
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/hostel-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 7.4 Verify Nginx is Running
```bash
sudo systemctl status nginx

# Should show: active (running)
```

### 7.5 Test Through Nginx
```bash
curl http://localhost
# Should see: "Hostel Management API is running"
```

---

## Step 8: Setup SSL Certificate

### 8.1 Install SSL Certificate (Let's Encrypt - Free)
```bash
# If using domain name
sudo certbot certonly --nginx -d api.example.com

# Follow prompts:
# - Enter email
# - Accept terms
# - Choose redirect option
```

### 8.2 Create Auto-Renewal for SSL
```bash
# Certbot auto-renewal is typically already configured
# Verify:
sudo systemctl status certbot.timer

# Should show: active (running)
```

### 8.3 Update Nginx Configuration with SSL
```bash
sudo nano /etc/nginx/sites-available/hostel-api
```

Replace the configuration with:
```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Client body size limit for file uploads (500MB)
    client_max_body_size 500M;
    
    # Proxy settings
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
    
    # Static files
    location /uploads/ {
        alias /var/www/hostel-management-api/uploads/;
        expires 30d;
    }
    
    location /tv-display/ {
        alias /var/www/hostel-management-api/public/tv-display/;
        expires 7d;
    }
}
```

### 8.4 Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 9: Setup Firewall Rules

### 9.1 Enable UFW Firewall
```bash
sudo ufw enable
```

### 9.2 Allow Ports
```bash
# SSH (keep this!)
sudo ufw allow 22/tcp

# HTTP
sudo ufw allow 80/tcp

# HTTPS
sudo ufw allow 443/tcp

# Deny all other inbound traffic
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### 9.3 Verify Firewall Status
```bash
sudo ufw status verbose
```

---

## Step 10: Domain & DNS Setup

### 10.1 Point Domain to Server
1. Go to your domain registrar (GoDaddy, Namecheap, etc.)
2. Find DNS settings
3. Update **A Record:**
   - **Name:** @ (or api for subdomain)
   - **Type:** A
   - **Value:** Your Civo Instance IP Address
   - **TTL:** 3600 (or default)

### 10.2 Wait for DNS Propagation
```bash
# Check DNS resolution (wait 5-30 minutes)
nslookup api.example.com
# Should show your Civo IP
```

### 10.3 Update Nginx Configuration
Update server_name in Nginx config if using domain

---

## Monitoring & Maintenance

### Application Logs
```bash
# Real-time logs
pm2 logs hostel-api

# Last 100 lines
pm2 logs hostel-api --lines 100

# Specific time range
pm2 logs hostel-api --err
```

### System Monitoring
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check CPU
top  # Press q to exit
```

### Restart Application
```bash
# Restart app
pm2 restart hostel-api

# Restart all
pm2 restart all

# Reload (0 downtime)
pm2 reload hostel-api
```

### Update Application (Pull Latest Code)
```bash
cd /var/www/hostel-management-api
git pull origin development
npm install
pm2 reload hostel-api
```

### Backup Strategy
```bash
# Daily automated backups (add to crontab)
crontab -e

# Add this line:
0 2 * * * tar -czf /backups/hostel-api-$(date +\%Y\%m\%d).tar.gz /var/www/hostel-management-api

# Or use Civo's automatic backups (in dashboard)
```

---

## Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs hostel-api --err

# Check if port 5000 is in use
lsof -i :5000

# Manually test
node /var/www/hostel-management-api/server.js
```

### Nginx Not Proxying Correctly
```bash
# Test Nginx syntax
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check access logs
sudo tail -f /var/log/nginx/access.log
```

### MongoDB Connection Issues
```bash
# Verify connection string is correct in .env
cat /var/www/hostel-management-api/.env | grep MONGO_URI

# Test connection from server
curl -X GET http://localhost:5000
```

### SSL Certificate Issues
```bash
# Check certificate validity
sudo certbot certificates

# Renew manually
sudo certbot renew --dry-run

# Fix permissions
sudo chown -R root:root /etc/letsencrypt/live/
```

---

## Performance Optimization

### 1. Enable Gzip Compression in Nginx
```bash
sudo nano /etc/nginx/nginx.conf
# Add inside http block:
gzip on;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;
```

### 2. Optimize Node.js Performance
```bash
# In PM2 config, use cluster mode:
pm2 start server.js --name "hostel-api" --instances max
```

### 3. Monitor Civo Instance Resources
- Check CPU/Memory in Civo dashboard
- Upgrade instance if needed (scale vertically)

### 4. Database Optimization
- Ensure MongoDB Atlas has proper indexing
- Use connection pooling

---

## Cost Management

### Civo Pricing (as of Feb 2026):
- **Small Instance (1GB):** ~$6/month
- **Medium Instance (2GB):** ~$12/month
- **Large Instance (4GB):** ~$24/month

### Cost Reduction Tips:
- Start with Small instance, upgrade if needed
- Use MongoDB Atlas free tier if under limits
- Use Cloudinary free tier for image storage
- Monitor data transfer (first 1TB free)

---

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Setup monitoring alerts
3. ✅ Configure CORS if needed
4. ✅ Test file uploads (500MB limit)
5. ✅ Monitor logs for errors
6. ✅ Setup automated backups
7. ✅ Test SSL certificate validity
8. ✅ Load test with real users

---

## Support & Resources

- **Civo Documentation:** https://www.civo.com/docs
- **PM2 Documentation:** https://pm2.keymetrics.io/
- **Nginx Documentation:** https://nginx.org/en/docs/
- **Let's Encrypt Documentation:** https://letsencrypt.org/docs/
- **Node.js Production Practices:** https://nodejs.org/en/docs/guides/nodejs-docker-webapp/

---

## Checklist

- [ ] Civo instance created
- [ ] SSH access verified
- [ ] Node.js installed
- [ ] Git cloned repository
- [ ] npm dependencies installed
- [ ] .env file configured with secrets
- [ ] PM2 started and auto-start enabled
- [ ] Nginx configured as reverse proxy
- [ ] SSL certificate installed
- [ ] Firewall rules configured
- [ ] Domain DNS updated
- [ ] Application accessible from internet
- [ ] Monitoring and logs working
- [ ] Backups configured

---

**Deployment Status:** Ready for Production! 🚀

For questions or issues, check logs or contact Civo support.
