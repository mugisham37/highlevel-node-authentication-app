# Operational Runbooks

## Enterprise Authentication Backend

This document provides comprehensive operational procedures for maintaining, troubleshooting, and managing the enterprise authentication backend system.

## 🚨 Emergency Response Procedures

### Service Down (Critical)

**Symptoms:**

- Health check endpoints returning 503/500 errors
- Users cannot authenticate
- Monitoring alerts showing service unavailable

**Immediate Actions (0-5 minutes):**

1. Check service status: `docker ps | grep auth-backend`
2. Check logs: `docker logs auth-backend-prod --tail 100`
3. Verify database connectivity: `docker exec auth-backend-prod npm run health:db`
4. Check Redis connectivity: `docker exec auth-backend-prod npm run health:redis`

**Investigation Steps:**

1. Check system resources: `docker stats auth-backend-prod`
2. Review recent deployments in deployment log
3. Check for OOM kills: `dmesg | grep -i "killed process"`
4. Verify network connectivity to dependencies

**Resolution Steps:**

1. **If container crashed:** `docker restart auth-backend-prod`
2. **If database issue:** Check database runbook section
3. **If Redis issue:** Check Redis runbook section
4. **If resource exhaustion:** Scale up resources or restart with limits

**Recovery Verification:**

1. Verify health endpoints: `curl http://localhost:3000/health/ready`
2. Test authentication flow: Use integration test suite
3. Monitor error rates for 15 minutes
4. Verify all dependent services are functioning

### High Error Rate (Critical)

**Symptoms:**

- Error rate > 10% for 2+ minutes
- Users experiencing authentication failures
- Increased support tickets

**Immediate Actions:**

1. Check error distribution: Review Grafana dashboard
2. Identify error patterns: `docker logs auth-backend-prod | grep ERROR | tail -50`
3. Check database performance: Review database metrics
4. Verify external service status (OAuth providers, email service)

**Investigation Steps:**

1. Analyze error types and frequencies
2. Check for recent configuration changes
3. Review database query performance
4. Verify rate limiting isn't causing false positives

**Resolution Steps:**

1. **If database performance issue:** Restart read replicas, check query optimization
2. **If external service issue:** Enable graceful degradation mode
3. **If configuration issue:** Rollback recent changes
4. **If load issue:** Scale horizontally or enable rate limiting

### Authentication Failure Spike (Critical)

**Symptoms:**

- Authentication failure rate > 10/second
- Potential brute force attack
- Account lockouts increasing

**Immediate Actions:**

1. **SECURITY PRIORITY:** Check for attack patterns
2. Review failed login attempts: Check audit logs
3. Identify source IPs: `docker logs auth-backend-prod | grep "authentication failed" | tail -100`
4. Check rate limiting effectiveness

**Investigation Steps:**

1. Analyze attack vectors and patterns
2. Check if legitimate users are affected
3. Review geographic distribution of failures
4. Verify MFA bypass attempts

**Resolution Steps:**

1. **If confirmed attack:** Enable emergency rate limiting
2. **If specific IP ranges:** Block at firewall/load balancer level
3. **If credential stuffing:** Force password resets for affected accounts
4. **If system issue:** Check authentication service logic

**Post-Incident:**

1. Document attack patterns
2. Update security rules
3. Review and improve detection mechanisms
4. Notify security team and affected users

## 🔧 Maintenance Procedures

### Routine Maintenance Schedule

**Daily (Automated):**

- Health check monitoring
- Log rotation and cleanup
- Backup verification
- Security scan updates
- Performance metrics review

**Weekly (Manual Review):**

- Review error logs and patterns
- Check capacity utilization trends
- Verify backup integrity
- Update security patches
- Review performance benchmarks

**Monthly (Planned Maintenance):**

- Database maintenance and optimization
- Certificate renewal checks
- Dependency updates
- Security audit review
- Disaster recovery testing

### Database Maintenance

**Daily Database Tasks:**

```bash
# Check database health
docker exec postgres-primary-prod pg_isready -U $POSTGRES_USER

# Check replication status
docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT * FROM pg_stat_replication;"

# Check database size and growth
docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT pg_size_pretty(pg_database_size('$POSTGRES_DB'));"
```

**Weekly Database Tasks:**

```bash
# Analyze and vacuum tables
docker exec postgres-primary-prod psql -U $POSTGRES_USER -d $POSTGRES_DB -c "VACUUM ANALYZE;"

# Check for long-running queries
docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# Review slow query log
docker exec postgres-primary-prod tail -100 /var/log/postgresql/postgresql-slow.log
```

**Monthly Database Tasks:**

```bash
# Full database backup verification
npm run backup:verify

# Index usage analysis
docker exec postgres-primary-prod psql -U $POSTGRES_USER -d $POSTGRES_DB -f /scripts/analyze-indexes.sql

# Database statistics update
docker exec postgres-primary-prod psql -U $POSTGRES_USER -d $POSTGRES_DB -c "ANALYZE;"
```

### Redis Maintenance

**Daily Redis Tasks:**

```bash
# Check Redis health
docker exec redis-master-prod redis-cli ping

# Check memory usage
docker exec redis-master-prod redis-cli info memory

# Check connected clients
docker exec redis-master-prod redis-cli info clients
```

**Weekly Redis Tasks:**

```bash
# Check keyspace statistics
docker exec redis-master-prod redis-cli info keyspace

# Review slow log
docker exec redis-master-prod redis-cli slowlog get 10

# Check persistence status
docker exec redis-master-prod redis-cli lastsave
```

### Application Maintenance

**Daily Application Tasks:**

```bash
# Check application health
curl -f http://localhost:3000/health/ready

# Review error logs
docker logs auth-backend-prod --since 24h | grep ERROR

# Check memory usage
docker stats auth-backend-prod --no-stream
```

**Weekly Application Tasks:**

```bash
# Review performance metrics
curl http://localhost:3000/metrics | grep -E "(response_time|error_rate|throughput)"

# Check for memory leaks
docker exec auth-backend-prod node --expose-gc -e "global.gc(); console.log(process.memoryUsage());"

# Review security events
docker logs auth-backend-prod --since 7d | grep "SECURITY"
```

## 🔍 Troubleshooting Guide

### Performance Issues

**Slow Response Times:**

1. **Check Database Performance:**

   ```bash
   # Check active connections
   docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT count(*) FROM pg_stat_activity;"

   # Check slow queries
   docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
   ```

2. **Check Cache Performance:**

   ```bash
   # Check Redis performance
   docker exec redis-master-prod redis-cli info stats

   # Check cache hit rates
   curl http://localhost:3000/metrics | grep cache_hit_ratio
   ```

3. **Check Application Performance:**

   ```bash
   # Check Node.js event loop lag
   docker exec auth-backend-prod node -e "console.log(process.hrtime())"

   # Check garbage collection stats
   docker logs auth-backend-prod | grep "GC"
   ```

**High Memory Usage:**

1. **Identify Memory Leaks:**

   ```bash
   # Generate heap dump
   docker exec auth-backend-prod kill -USR2 $(docker exec auth-backend-prod pgrep node)

   # Check memory distribution
   docker exec auth-backend-prod node --expose-gc -e "global.gc(); console.log(process.memoryUsage());"
   ```

2. **Check for Memory-Intensive Operations:**

   ```bash
   # Review large object allocations
   docker logs auth-backend-prod | grep "Large allocation"

   # Check for memory warnings
   docker logs auth-backend-prod | grep -i "memory"
   ```

### Authentication Issues

**Users Cannot Login:**

1. **Check Authentication Service:**

   ```bash
   # Test authentication endpoint
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass"}'
   ```

2. **Check Database Connectivity:**

   ```bash
   # Test database connection
   docker exec auth-backend-prod npm run db:test
   ```

3. **Check External Services:**
   ```bash
   # Test OAuth providers
   curl -I https://accounts.google.com/.well-known/openid_configuration
   curl -I https://github.com/login/oauth/access_token
   ```

**MFA Issues:**

1. **Check TOTP Service:**

   ```bash
   # Verify TOTP generation
   docker exec auth-backend-prod node -e "const speakeasy = require('speakeasy'); console.log(speakeasy.totp({secret: 'test', encoding: 'base32'}));"
   ```

2. **Check SMS Service:**
   ```bash
   # Test Twilio connectivity
   curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json \
     -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN \
     -d "From=$TWILIO_PHONE_NUMBER" \
     -d "To=+1234567890" \
     -d "Body=Test message"
   ```

### Database Issues

**Connection Pool Exhaustion:**

1. **Check Active Connections:**

   ```bash
   docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```

2. **Kill Long-Running Queries:**

   ```bash
   docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '10 minutes';"
   ```

3. **Restart Connection Pool:**
   ```bash
   docker exec auth-backend-prod kill -USR1 $(docker exec auth-backend-prod pgrep node)
   ```

**Replication Issues:**

1. **Check Replication Status:**

   ```bash
   docker exec postgres-primary-prod psql -U $POSTGRES_USER -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;"
   ```

2. **Check Replication Lag:**

   ```bash
   docker exec postgres-replica-prod psql -U $POSTGRES_USER -c "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()));"
   ```

3. **Restart Replication:**
   ```bash
   docker restart postgres-replica-prod
   ```

### Redis Issues

**Memory Issues:**

1. **Check Memory Usage:**

   ```bash
   docker exec redis-master-prod redis-cli info memory
   ```

2. **Clear Expired Keys:**

   ```bash
   docker exec redis-master-prod redis-cli --scan --pattern "*" | xargs -L 1000 docker exec redis-master-prod redis-cli del
   ```

3. **Adjust Memory Policy:**
   ```bash
   docker exec redis-master-prod redis-cli config set maxmemory-policy allkeys-lru
   ```

**Connection Issues:**

1. **Check Connected Clients:**

   ```bash
   docker exec redis-master-prod redis-cli info clients
   ```

2. **Check for Blocked Clients:**
   ```bash
   docker exec redis-master-prod redis-cli client list | grep blocked
   ```

## 📊 Monitoring and Alerting

### Key Metrics to Monitor

**Application Metrics:**

- Response time (95th percentile < 100ms)
- Error rate (< 1%)
- Throughput (requests/second)
- Authentication success rate (> 99%)
- Active sessions count
- Cache hit rate (> 90%)

**Infrastructure Metrics:**

- CPU usage (< 80%)
- Memory usage (< 80%)
- Disk usage (< 80%)
- Network I/O
- Database connections
- Redis memory usage

**Security Metrics:**

- Failed authentication attempts
- Account lockouts
- Suspicious activity events
- Rate limiting triggers
- Security events by severity

### Alert Response Procedures

**Critical Alerts (Immediate Response):**

1. Acknowledge alert within 5 minutes
2. Begin investigation immediately
3. Escalate to on-call engineer if needed
4. Document actions taken
5. Provide status updates every 15 minutes

**Warning Alerts (Response within 30 minutes):**

1. Acknowledge alert within 30 minutes
2. Investigate during business hours
3. Document findings and actions
4. Schedule resolution if needed

**Info Alerts (Response within 4 hours):**

1. Review during business hours
2. Document for trend analysis
3. Schedule preventive actions if needed

## 🔄 Deployment Procedures

### Standard Deployment

1. **Pre-deployment Checks:**

   ```bash
   # Run tests
   npm test

   # Check dependencies
   npm audit

   # Verify configuration
   npm run config:validate
   ```

2. **Deployment Steps:**

   ```bash
   # Build new image
   docker build -t enterprise-auth-backend:new .

   # Stop old container
   docker stop auth-backend-prod

   # Start new container
   docker run -d --name auth-backend-prod-new enterprise-auth-backend:new

   # Verify health
   curl http://localhost:3000/health/ready

   # Switch traffic
   docker stop auth-backend-prod
   docker rename auth-backend-prod-new auth-backend-prod
   ```

3. **Post-deployment Verification:**

   ```bash
   # Run integration tests
   npm run test:integration

   # Monitor for 30 minutes
   # Check error rates and response times
   ```

### Rollback Procedures

1. **Immediate Rollback:**

   ```bash
   # Stop current container
   docker stop auth-backend-prod

   # Start previous version
   docker run -d --name auth-backend-prod enterprise-auth-backend:previous

   # Verify health
   curl http://localhost:3000/health/ready
   ```

2. **Database Rollback (if needed):**

   ```bash
   # Run migration rollback
   npm run db:migrate:down

   # Verify data integrity
   npm run db:validate
   ```

## 📋 Incident Response

### Incident Classification

**Severity 1 (Critical):**

- Complete service outage
- Data breach or security incident
- Authentication completely unavailable

**Severity 2 (High):**

- Partial service degradation
- High error rates affecting users
- Performance significantly degraded

**Severity 3 (Medium):**

- Minor service issues
- Some users affected
- Workarounds available

**Severity 4 (Low):**

- Cosmetic issues
- No user impact
- Enhancement requests

### Incident Response Process

1. **Detection and Alert:**
   - Monitor alerts and user reports
   - Classify incident severity
   - Create incident ticket

2. **Response and Investigation:**
   - Assemble response team
   - Begin investigation using runbooks
   - Implement immediate fixes

3. **Communication:**
   - Notify stakeholders
   - Provide regular updates
   - Update status page

4. **Resolution and Recovery:**
   - Implement permanent fix
   - Verify system stability
   - Close incident ticket

5. **Post-Incident Review:**
   - Conduct blameless post-mortem
   - Document lessons learned
   - Implement preventive measures

## 🔐 Security Procedures

### Security Incident Response

1. **Immediate Actions:**
   - Isolate affected systems
   - Preserve evidence
   - Notify security team
   - Begin forensic analysis

2. **Investigation:**
   - Analyze logs and metrics
   - Identify attack vectors
   - Assess data exposure
   - Document findings

3. **Containment:**
   - Block malicious traffic
   - Revoke compromised credentials
   - Apply security patches
   - Monitor for persistence

4. **Recovery:**
   - Restore from clean backups
   - Implement additional controls
   - Verify system integrity
   - Resume normal operations

5. **Post-Incident:**
   - Notify affected users
   - Update security policies
   - Improve detection capabilities
   - Conduct security review

### Regular Security Tasks

**Daily:**

- Review security alerts
- Check for failed authentication attempts
- Monitor suspicious activities
- Verify backup integrity

**Weekly:**

- Review access logs
- Update security signatures
- Check certificate expiration
- Analyze security metrics

**Monthly:**

- Conduct security scans
- Review user access rights
- Update security documentation
- Test incident response procedures

---

_This runbook should be regularly updated and tested to ensure accuracy and effectiveness. All procedures should be validated in a staging environment before being applied to production._
