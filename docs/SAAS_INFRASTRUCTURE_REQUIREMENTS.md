# SaaS Infrastructure Requirements — Cover ALL The Bases

**Reality check:** We have ML models but no way to collect payments, send emails, or onboard users. Missing fundamental SaaS infrastructure.

---

## Part 1: Email Infrastructure

### 1.1: Transactional Emails (Critical)

**Use cases:**
- Welcome email (account created)
- Email verification
- Password reset
- Recommendation alerts ("Cold weather coming, approve +20% budget")
- Weekly digests
- Invoice/receipt emails
- Team invitations

**Options:**

**Option A: SendGrid (Recommended)**
- Pros: 100 emails/day free, good deliverability, simple API
- Cons: Costs scale with volume ($15/mo for 40k emails)

**Option B: AWS SES**
- Pros: Cheapest ($0.10 per 1000 emails), high volume
- Cons: Harder setup (verify domain, manage bounces)

**Option C: Postmark**
- Pros: Best deliverability (designed for transactional), detailed analytics
- Cons: More expensive ($15/mo for 10k emails)

**Recommendation:** Start with SendGrid (easy), migrate to SES if volume exceeds 100k/month

**Implementation:**
```typescript
// apps/api/services/email/EmailService.ts
import sgMail from '@sendgrid/mail';

export class EmailService {
  async sendWelcome(to: string, name: string) {
    await sgMail.send({
      to,
      from: 'hello@weathervane.ai',
      templateId: 'd-xxxxx',  // SendGrid template
      dynamicTemplateData: { name },
    });
  }

  async sendRecommendationAlert(to: string, recommendation: Recommendation) {
    await sgMail.send({
      to,
      from: 'alerts@weathervane.ai',
      subject: `Weather Alert: ${recommendation.type}`,
      html: renderRecommendationEmail(recommendation),
    });
  }

  async sendWeeklyDigest(to: string, stats: WeeklyStats) {
    await sgMail.send({
      to,
      from: 'digest@weathervane.ai',
      templateId: 'd-yyyyy',
      dynamicTemplateData: stats,
    });
  }
}
```

**Email templates needed:**
- Welcome + email verification
- Password reset
- Recommendation alert (urgent)
- Weekly digest (summary)
- Invoice/receipt
- Team invitation
- Onboarding tips (drip campaign)

### 1.2: Marketing Emails (Optional Phase 2)

**Use cases:**
- Product updates newsletter
- Educational content ("How to optimize winter campaigns")
- Re-engagement campaigns

**Tool:** Mailchimp or Customer.io (separate from transactional)

**Regulation:** CAN-SPAM compliance (unsubscribe link, physical address)

---

## Part 2: Payment Processing (Stripe)

### 2.1: Subscription Billing

**Tiers:**
```
Starter: $99/mo
  - 1 user
  - Up to $50k/mo ad spend
  - Basic recommendations
  - Email support

Growth: $299/mo
  - 5 users
  - Up to $250k/mo ad spend
  - Advanced recommendations + autopilot
  - Priority support

Enterprise: Custom pricing
  - Unlimited users
  - Unlimited ad spend
  - Custom models
  - Dedicated support + Slack channel
```

**Implementation:**
```typescript
// apps/api/services/billing/StripeService.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class StripeService {
  async createCustomer(email: string, name: string) {
    return await stripe.customers.create({
      email,
      name,
      metadata: { source: 'weathervane' },
    });
  }

  async createSubscription(customerId: string, priceId: string) {
    return await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'invoice.paid':
        // Provision service
        await activateAccount(event.data.object.customer);
        break;
      case 'invoice.payment_failed':
        // Send warning email, suspend service after 3 failures
        await handleFailedPayment(event.data.object.customer);
        break;
      case 'customer.subscription.deleted':
        // Cancel service
        await deactivateAccount(event.data.object.customer);
        break;
    }
  }
}
```

**Stripe features to use:**
- **Checkout:** Pre-built payment page (faster than custom)
- **Customer Portal:** Let customers update payment method, cancel subscription
- **Webhooks:** Handle payment events (paid, failed, canceled)
- **Metered billing (optional):** Charge per $100k ad spend (usage-based pricing)

### 2.2: Usage-Based Pricing (Advanced)

**Scenario:** Charge based on ad spend managed
```
Starter: $99/mo base + $10 per $10k ad spend
Growth: $299/mo base + $8 per $10k ad spend
```

**Implementation:**
```typescript
async reportUsage(customerId: string, adSpend: number) {
  const subscriptionItem = await getSubscriptionItem(customerId);

  await stripe.subscriptionItems.createUsageRecord(
    subscriptionItem.id,
    {
      quantity: Math.floor(adSpend / 10000),  // $10k units
      timestamp: Math.floor(Date.now() / 1000),
    }
  );
}
```

**Advantage:** Aligns pricing with customer value (high spend = high value)

### 2.3: Free Trial

**Options:**
1. **14-day trial, no credit card:** Easy signup, higher activation, higher churn
2. **14-day trial with credit card:** Lower signup, lower activation, lower churn
3. **Forever free tier:** Freemium model (limited features)

**Recommendation:** 14-day trial with credit card (Stripe handles this)

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  trial_period_days: 14,  // Free for 14 days
});
```

---

## Part 3: Notification System

### 3.1: In-App Notifications

**Use cases:**
- "New recommendation available"
- "Weather alert: Cold front coming"
- "Model retraining completed"
- "Recommendation accepted/rejected by team member"

**Implementation:**
```typescript
// apps/api/services/notifications/NotificationService.ts
export class NotificationService {
  async createNotification(userId: string, notification: {
    type: 'recommendation' | 'alert' | 'system',
    title: string,
    message: string,
    actionUrl?: string,
    priority: 'low' | 'medium' | 'high',
  }) {
    // Store in database
    await db.notifications.create({
      userId,
      ...notification,
      read: false,
      createdAt: new Date(),
    });

    // Send real-time via WebSocket
    io.to(`user:${userId}`).emit('notification', notification);
  }

  async markAsRead(notificationId: string) {
    await db.notifications.update(notificationId, { read: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await db.notifications.count({ userId, read: false });
  }
}
```

**Frontend:**
```typescript
// apps/web/components/NotificationBell.tsx
export function NotificationBell() {
  const { notifications, unreadCount } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger>
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
      </PopoverTrigger>
      <PopoverContent>
        {notifications.map(n => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

### 3.2: Push Notifications (Mobile)

**Use cases:**
- "Urgent: Approve recommendation before cold front hits (in 2 hours)"
- "Weekly summary: +15% ROAS this week"

**Options:**
- **Firebase Cloud Messaging (FCM):** Free, iOS + Android, web push
- **OneSignal:** Free tier, easier setup, analytics

**Implementation:**
```typescript
import admin from 'firebase-admin';

async function sendPushNotification(userId: string, message: string) {
  const tokens = await getUserDeviceTokens(userId);

  await admin.messaging().sendMulticast({
    tokens,
    notification: {
      title: 'WeatherVane Alert',
      body: message,
    },
    data: {
      type: 'recommendation',
      url: '/dashboard/recommendations',
    },
  });
}
```

### 3.3: Email Notifications (via SendGrid)

**Preferences:**
```typescript
// Let users control notification frequency
userPreferences = {
  email_recommendations: 'instant' | 'daily_digest' | 'weekly_digest' | 'never',
  email_alerts: 'instant' | 'daily_digest' | 'never',
  email_marketing: boolean,
}
```

### 3.4: Slack Notifications (Webhook)

**Use case:** Post recommendations to #marketing channel
```typescript
async function sendSlackNotification(webhookUrl: string, recommendation: Recommendation) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🌤️ Weather Alert`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Cold front coming. Recommend *+20% budget* for winter coats.`,
          },
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: 'Approve', url: 'https://app.weathervane.ai/...' },
            { type: 'button', text: 'Reject', url: '...' },
          ],
        },
      ],
    }),
  });
}
```

---

## Part 4: Guided Onboarding Tour

### 4.1: Product Tour Library

**Options:**
- **Intro.js:** Open source, simple
- **Shepherd.js:** More customizable
- **Driver.js:** Modern, lightweight (Recommended)
- **Appcues:** Paid SaaS, advanced features

**Implementation with Driver.js:**
```typescript
// apps/web/components/OnboardingTour.tsx
import { driver } from 'driver.js';

export function startOnboardingTour() {
  const driverObj = driver({
    showProgress: true,
    steps: [
      {
        element: '#connect-shopify',
        popover: {
          title: 'Connect Your Store',
          description: 'Link Shopify to see your products and sales data.',
          position: 'bottom',
        },
      },
      {
        element: '#weather-dashboard',
        popover: {
          title: 'Weather Intelligence',
          description: 'See how weather affects your sales in real-time.',
        },
      },
      {
        element: '#recommendations',
        popover: {
          title: 'AI Recommendations',
          description: 'Get budget recommendations based on weather forecasts.',
        },
      },
      {
        element: '#approve-button',
        popover: {
          title: 'Approve in One Click',
          description: 'Review and approve recommendations instantly.',
        },
      },
    ],
  });

  driverObj.drive();
}
```

### 4.2: Onboarding Checklist

**Pattern:** Show progress, celebrate completion
```typescript
// apps/web/components/OnboardingChecklist.tsx
const steps = [
  { id: 'connect_shopify', label: 'Connect Shopify', completed: true },
  { id: 'connect_meta', label: 'Connect Meta Ads', completed: false },
  { id: 'view_dashboard', label: 'View Dashboard', completed: false },
  { id: 'approve_recommendation', label: 'Approve First Recommendation', completed: false },
];

export function OnboardingChecklist() {
  const progress = steps.filter(s => s.completed).length / steps.length;

  return (
    <Card>
      <h3>Get Started</h3>
      <Progress value={progress * 100} />
      {steps.map(step => (
        <ChecklistItem key={step.id} {...step} />
      ))}
    </Card>
  );
}
```

### 4.3: Contextual Help (Tooltips)

**Pattern:** Show help where needed
```typescript
<Tooltip content="Budget recommendations based on weather forecast and historical performance">
  <InfoIcon className="w-4 h-4 text-gray-400" />
</Tooltip>
```

### 4.4: Empty States with Guidance

**Pattern:** Don't just show "No data", guide next action
```typescript
function EmptyRecommendations() {
  return (
    <EmptyState
      icon={<CloudRain />}
      title="No recommendations yet"
      description="Connect your ad accounts to get weather-aware budget recommendations."
      action={
        <Button onClick={() => router.push('/settings/integrations')}>
          Connect Ad Accounts
        </Button>
      }
    />
  );
}
```

---

## Part 5: Admin & Developer Frontends

### 5.1: Admin Dashboard

**Features needed:**
- User management (list, suspend, delete)
- Subscription overview (MRR, churn, LTV)
- Support tools (impersonate user, view logs)
- Feature flags (enable/disable features per user)
- System health (API uptime, model performance)

**Implementation:**
```typescript
// apps/web/pages/admin/users.tsx
export default function AdminUsersPage() {
  const { users } = useAdminUsers();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>MRR</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow key={user.id}>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.plan}</TableCell>
            <TableCell>${user.mrr}</TableCell>
            <TableCell>
              <Badge variant={user.status === 'active' ? 'success' : 'warning'}>
                {user.status}
              </Badge>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuItem onClick={() => impersonateUser(user.id)}>
                  Impersonate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => viewLogs(user.id)}>
                  View Logs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => suspendUser(user.id)}>
                  Suspend
                </DropdownMenuItem>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### 5.2: Developer Portal

**Features needed:**
- API documentation (interactive docs)
- API key management (create, rotate, revoke)
- Webhook configuration
- Logs & debugging
- Rate limit monitoring

**Implementation:**
```typescript
// apps/web/pages/developer/api-keys.tsx
export default function APIKeysPage() {
  const { apiKeys } = useAPIKeys();

  return (
    <div>
      <h1>API Keys</h1>
      <Button onClick={createAPIKey}>Create New Key</Button>

      <Table>
        <TableBody>
          {apiKeys.map(key => (
            <TableRow key={key.id}>
              <TableCell>
                <code>{key.masked}</code>  {/* sk_live_****abc123 */}
              </TableCell>
              <TableCell>{key.createdAt}</TableCell>
              <TableCell>{key.lastUsed || 'Never'}</TableCell>
              <TableCell>
                <Button variant="destructive" onClick={() => revokeKey(key.id)}>
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**API Documentation (Swagger/OpenAPI):**
```typescript
// Auto-generate from API routes
import { generateOpenAPI } from '@/lib/openapi';

const spec = generateOpenAPI({
  title: 'WeatherVane API',
  version: '1.0.0',
  servers: [{ url: 'https://api.weathervane.ai' }],
});

// Serve at /api/docs
```

**Interactive docs:** Swagger UI or Redoc

### 5.3: Feature Flags

**Use cases:**
- Beta features (show to 10% of users)
- Kill switch (disable feature if broken)
- A/B testing (variant A vs B)

**Implementation:**
```typescript
// apps/api/services/FeatureFlags.ts
export class FeatureFlags {
  async isEnabled(userId: string, feature: string): Promise<boolean> {
    // Check user-specific overrides
    const override = await db.featureOverrides.findOne({ userId, feature });
    if (override) return override.enabled;

    // Check global rollout percentage
    const flag = await db.featureFlags.findOne({ feature });
    if (!flag) return false;

    // Consistent hash: same user always gets same result
    const hash = murmurhash(`${userId}:${feature}`);
    return (hash % 100) < flag.rolloutPercentage;
  }
}
```

**Frontend:**
```typescript
function NewFeature() {
  const { isEnabled } = useFeatureFlag('ai_autopilot');

  if (!isEnabled) return null;

  return <AutopilotSettings />;
}
```

---

## Part 6: Economics of Scale (Model Improves with Data)

### 6.1: Cross-Customer Learning

**Key insight:** More customers = better model (for everyone)

**Approach: Privacy-preserving aggregation**
```python
# Don't share raw data between customers (privacy violation)
# Instead: Aggregate learnings

# Example: Learn that "winter coats sell in cold" applies universally
category_weather_effects = aggregate_across_customers(
    category="winter_coats",
    weather="cold",
    privacy="differential_privacy"  # Add noise to protect individual customers
)

# New customer instantly gets this knowledge
new_customer_model = global_model + customer_specific_adjustments
```

**Privacy techniques:**
- **Differential privacy:** Add noise to aggregated statistics
- **Federated learning:** Train models locally, aggregate weights (not data)
- **Secure aggregation:** Cryptographic protocols (advanced)

### 6.2: Similar Products Benefit Each Other

**Scenario:** Customer A sells "Brand X winter coat", Customer B sells "Brand Y winter coat"

**Naive approach:** Separate models (wasteful, slow learning)

**Better approach: Transfer learning**
```python
# Learn "winter coat" category pattern from both customers
winter_coat_pattern = learn_from_customers([A, B])

# New customer C with "Brand Z winter coat" instantly gets:
# - Winter coat category knowledge
# - Cold weather response pattern
# - Seasonal dynamics
# Without needing months of their own data!
```

**Implementation:**
```python
# Hierarchical model with global + local components
sales[customer, product] = (
    global_category_effect[category] +       # Learned from ALL customers
    customer_category_effect[customer, category] +  # Customer-specific
    product_effect[product]                   # Product-specific
)

# New customer starts with global knowledge, refines over time
```

### 6.3: Economics of Scale in Practice

**Scenario 1: New customer (Day 1)**
```
Data: 0 sales history
Model: 100% global knowledge (borrowed from similar customers)
Accuracy: 70% (good enough to start)
```

**Scenario 2: Growing customer (Month 1)**
```
Data: 30 days of sales
Model: 70% global + 30% customer-specific
Accuracy: 80% (improving)
```

**Scenario 3: Mature customer (Month 6)**
```
Data: 180 days of sales
Model: 40% global + 60% customer-specific
Accuracy: 90% (excellent)
```

**Scenario 4: Network effect (1000 customers)**
```
Global model trained on 1000 customers × 365 days = 365k days of data
New customer gets 365k days of knowledge instantly (cold-start solved!)
```

### 6.4: Virtuous Cycle

**More customers → Better global model → Better new customer experience → More customers**

**Metrics to track:**
- Global model accuracy (improves with customers)
- New customer time-to-value (should decrease)
- Model convergence speed (faster with more data)

### 6.5: Competitive Moat

**Network effect:** Later entrants can't compete
```
WeatherVane (1000 customers): New customer gets 365k days of knowledge
Competitor (10 customers): New customer gets 3.6k days of knowledge

→ 100x advantage in cold-start performance
```

---

## Part 7: Additional Infrastructure

### 7.1: Logging & Monitoring

**Application logging:**
- **Winston or Pino:** Structured JSON logs
- **LogDNA or Datadog:** Centralized log aggregation
- **Error tracking:** Sentry (captures exceptions + stack traces)

**Metrics:**
- **Prometheus:** Collect metrics (API latency, DB queries, etc)
- **Grafana:** Visualize metrics
- **Uptime monitoring:** UptimeRobot or Pingdom

### 7.2: Customer Support

**Help desk:**
- **Intercom:** Live chat + help center + email support (all-in-one)
- **Zendesk:** Traditional ticketing
- **Plain:** Modern, developer-friendly

**Knowledge base:**
- Intercom Articles
- GitBook
- Notion (public pages)

### 7.3: Analytics

**Product analytics:**
- **Mixpanel:** Event tracking, funnels, retention
- **Amplitude:** Similar to Mixpanel
- **PostHog:** Open source, self-hosted

**Business metrics:**
- **ChartMogul:** MRR, churn, LTV (Stripe integration)
- **Baremetrics:** Similar, simpler UI

### 7.4: Security

**Essentials:**
- **SSL/TLS:** Let's Encrypt (free) or Cloudflare
- **Rate limiting:** Prevent abuse (express-rate-limit)
- **CORS:** Restrict API access
- **SQL injection prevention:** Use parameterized queries (Prisma/TypeORM)
- **XSS prevention:** Sanitize inputs
- **CSRF tokens:** Protect forms
- **Security headers:** helmet.js

**Advanced:**
- **DDoS protection:** Cloudflare
- **WAF (Web Application Firewall):** Cloudflare or AWS WAF
- **Penetration testing:** Annual security audit
- **SOC 2 compliance:** Required for enterprise customers

---

## Part 8: Roadmap Tasks to Add

### Epic 31: SaaS Infrastructure Foundations

**M31.1: Email & Notifications (20 hrs)**
- T31.1.1: Integrate SendGrid for transactional emails (6 hrs)
- T31.1.2: Email templates (welcome, alert, digest, reset) (8 hrs)
- T31.1.3: In-app notification system (WebSocket) (6 hrs)

**M31.2: Payment Processing (24 hrs)**
- T31.2.1: Stripe integration (subscription billing) (8 hrs)
- T31.2.2: Webhook handling (payment events) (6 hrs)
- T31.2.3: Customer portal (manage subscription, payment method) (6 hrs)
- T31.2.4: Usage tracking for metered billing (4 hrs)

**M31.3: Onboarding & Activation (18 hrs)**
- T31.3.1: Guided product tour (Driver.js) (8 hrs)
- T31.3.2: Onboarding checklist component (4 hrs)
- T31.3.3: Contextual help & empty states (6 hrs)

**M31.4: Admin & Developer Tools (24 hrs)**
- T31.4.1: Admin dashboard (user management, metrics) (12 hrs)
- T31.4.2: Developer portal (API keys, docs, webhooks) (8 hrs)
- T31.4.3: Feature flags system (4 hrs)

**M31.5: Network Effects & Scale (16 hrs)**
- T31.5.1: Privacy-preserving cross-customer learning (8 hrs)
- T31.5.2: Transfer learning for new customers (cold-start) (6 hrs)
- T31.5.3: Global model + local refinement architecture (2 hrs)

**M31.6: Monitoring & Security (16 hrs)**
- T31.6.1: Logging (Winston) + error tracking (Sentry) (6 hrs)
- T31.6.2: Metrics (Prometheus) + dashboards (Grafana) (6 hrs)
- T31.6.3: Security hardening (rate limiting, headers, CORS) (4 hrs)

**Total: 118 hours (~3 weeks)**

---

## Summary: Essential SaaS Infrastructure

### ✅ Must-Have (Launch Blockers)
- [ ] Email (transactional): SendGrid
- [ ] Payments: Stripe subscriptions + webhooks
- [ ] Notifications: In-app (WebSocket) + email
- [ ] Onboarding: Guided tour + checklist
- [ ] Admin: User management, metrics
- [ ] Security: SSL, rate limiting, sanitization
- [ ] Monitoring: Logs, errors, uptime

### ✅ Should-Have (Post-Launch Priority)
- [ ] Developer portal: API keys, docs, webhooks
- [ ] Feature flags: Beta features, A/B tests, kill switches
- [ ] Push notifications: Mobile alerts
- [ ] Slack integration: Post to #marketing channel
- [ ] Analytics: Mixpanel or PostHog
- [ ] Help desk: Intercom or Plain

### ✅ Nice-to-Have (Improve Over Time)
- [ ] Customer portal: Self-service billing
- [ ] Knowledge base: Help articles
- [ ] Metered billing: Usage-based pricing
- [ ] SOC 2 compliance: Enterprise requirement

### ✅ Economics of Scale (Competitive Moat)
- [ ] Cross-customer learning: Global model trained on all customers
- [ ] Transfer learning: New customers instantly get 365k days of knowledge
- [ ] Privacy-preserving: Differential privacy, federated learning
- [ ] Network effect: More customers → better model → more customers

---

**Bottom line:** We've been building ML models but missing fundamental SaaS infrastructure: payments, emails, notifications, onboarding, admin tools, and—critically—network effects that make the model better with each new customer (competitive moat).
