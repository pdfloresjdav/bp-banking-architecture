workspace "BP Digital Banking" "C4 model of the BP digital-banking platform (Context, Containers, Components)." {

    # ------------------------------------------------------------------
    # Fixed naming convention (reused across documentation, diagrams and code):
    #   - Services in kebab-case with the bp-* prefix
    #   - Events: bp.<domain>.<fact>.vN
    # HA/DR is not modeled here (see the AWS infrastructure diagram, deliverable 3).
    # Core Banking = source of truth for balances/movements/transactions (assumption S-A1).
    # ------------------------------------------------------------------

    model {

        # Relationships defined at the component level are reflected in C1/C2.
        !impliedRelationships true

        # ---- Actors --------------------------------------------------
        cliente  = person "BP Customer" "Digital-banking user (web and mobile)." "Persona"
        operador = person "Operator / Support" "Internal staff querying audit and operational status." "Persona"

        # ---- External systems ---------------------------------------
        idp    = softwareSystem "OIDC IdP (Production)" "Existing OAuth2/OIDC identity provider. Issues and validates tokens. Keycloak locally." "External"
        core   = softwareSystem "Core Banking" "System of record: balances, accounts, movements, and transaction execution. WireMock locally." "External"
        compl  = softwareSystem "Complementary Customer System" "Detailed/enriched customer information. HTTP mock locally." "External"
        facial = softwareSystem "Facial Verification Provider" "Liveness + 1:1 document-face match for onboarding. Simulator locally." "External"
        email  = softwareSystem "Email Provider" "Email notification delivery (SES/3rd party). Simulator locally." "External"
        push   = softwareSystem "Mobile Push Provider" "Push notification delivery (APNs/FCM). Simulator locally." "External"

        # ---- BP system (containers) ---------------------------------
        bp = softwareSystem "BP Digital Banking Platform" "Layer of experience, orchestration and security. Not a ledger." {

            # Clients
            spa    = container "bp-web-spa" "Web SPA. Does not store tokens (the BFF keeps them)." "React + TypeScript" "WebApp"
            mobile = container "bp-mobile-app" "Cross-platform mobile app. Authorization Code + PKCE; secure storage." "React Native + TypeScript" "Mobile"

            # Edge
            edge    = container "bp-edge (CloudFront + WAF)" "CDN + L7 filtering (OWASP, rate limit, geo/bot). AWS managed; not simulated locally." "AWS CloudFront + WAF" "Edge"
            gateway = container "bp-api-gateway" "North-south entry: token authN (JWT), rate limit and routing. Traefik locally." "AWS API Gateway (HTTP API)" "Gateway"

            # Security / BFF
            bff      = container "bp-bff-web" "SPA BFF: starts OIDC (PKCE), keeps tokens server-side, issues an HttpOnly/Secure/SameSite session cookie + CSRF." "NestJS + TypeScript" "Security"
            identity = container "bp-identity-adapter" "OIDC adapter: token validation (JWKS), introspection, claims->permissions mapping, revocation." "NestJS + TypeScript" "Security"

            # Read domains
            customer  = container "bp-customer-service" "Customer profile (orchestrates Core + complementary). Projection, not the source of truth." "NestJS + TypeScript" "Domain"
            accounts  = container "bp-account-product-service" "Customer accounts and products (Core = truth)." "NestJS + TypeScript" "Domain"
            movements = container "bp-movements-service" "Historical movement query (CQRS-read, cursor pagination)." "NestJS + TypeScript" "Domain"

            # Financial command domains
            transfer = container "bp-transfer-service" "Transfer orders (own and interbank). Idempotency, explicit states, Outbox, reconciliation." "NestJS + TypeScript" "Domain" {
                transferController  = component "TransferController" "Inbound REST API. Requires Idempotency-Key, token, step-up." "NestJS Controller"
                createTransferUC    = component "CreateTransferUseCase" "Use case: authorizes the SOURCE account (interbank does not validate destination ownership), applies idempotency, persists PENDING, invokes the Core, resolves state (CONFIRMED/REJECTED/UNKNOWN)." "Application Service"
                getStatusUC         = component "GetTransferStatusUseCase" "Order status query." "Application Service"
                transferAggregate   = component "TransferAggregate" "Domain model and state machine PENDING->SUBMITTED->(CONFIRMED|REJECTED|UNKNOWN)." "Domain Model"
                transferRepository  = component "TransferRepository" "Persists order, idempotency key and Outbox in a single ACID transaction (UNIQUE constraint)." "Port + TypeORM Adapter"
                idempotencyStore    = component "IdempotencyStore" "Idempotency via INSERT with UNIQUE(idempotency_key) constraint in PostgreSQL (same TX)." "Port + Adapter"
                corePort            = component "CorePort (CoreIntegrationClient)" "Outbound port to bp-core-integration." "Port + HTTP Adapter"
                outboxPublisher     = component "OutboxPublisher" "Outbox relay to the event bus (at-least-once)." "Outbox Relay"
                reconciliationWorker = component "ReconciliationWorker" "Resolves UNKNOWN/PENDING orders by querying the Core status." "Scheduled Worker"
            }
            payment = container "bp-payment-service" "Bill payments (initial scope, assumption S-A2). Same pattern as transfer." "NestJS + TypeScript" "Domain"

            # Integration (ACL)
            coreint = container "bp-core-integration" "Anti-Corruption Layer to the Core: translates BP<->Core model, resilience, idempotency propagation, status lookup." "NestJS + TypeScript" "ACL" {
                coreInboundApi      = component "CoreIntegrationApi" "Internal REST API consumed by transfer/payment/read domains." "NestJS Controller"
                aclTranslator       = component "AclTranslator" "Translates the BP domain model <-> Core contract (mapping and error normalization)." "Mapper"
                coreClient          = component "CoreClient" "HTTP client to the Core. Propagates Idempotency-Key/operationId." "HTTP Client Adapter"
                resilience          = component "ResiliencePolicy" "Circuit breaker + retry with backoff/jitter + timeout + bulkhead." "Resilience"
                statusQuery         = component "CoreStatusQuery" "getOperationStatus: status lookup by reference (unknown result)." "HTTP Client Adapter"
                correlationRepo     = component "CorrelationRepository" "Correlation map between BP operation and Core reference." "Port + Adapter"
            }
            complint = container "bp-complementary-integration" "ACL to the complementary customer system (enrichment)." "NestJS + TypeScript" "ACL"

            # Sensitive identity
            onboarding = container "bp-onboarding-service" "Orchestrates onboarding with facial verification (1:1 + liveness) and consent. Stores no biometric templates." "NestJS + TypeScript" "Domain"

            # Cross-cutting
            notification = container "bp-notification-service" "Event consumer: sends email and push (>=2 channels). Idempotency by eventId." "NestJS + TypeScript" "Domain"
            audit        = container "bp-audit-service" "Append-only audit: successes, failures, auth attempts, rejections and security events. Minimization and hash-chain integrity." "NestJS + TypeScript" "Domain"

            # Data / messaging
            aurora  = container "bp-db-postgres" "ACID operational store: orders, idempotency keys (UNIQUE), Transactional Outbox, ACL correlation, append-only operational audit, and notification log." "PostgreSQL / Aurora PostgreSQL" "Database"
            redis   = container "bp-cache-redis" "Cache-aside cache (profile, products, movement pages) and BFF session." "Redis / ElastiCache" "Database"
            archive = container "bp-audit-archive" "Protected (WORM) audit retention archive. S3 Object Lock on AWS. Not simulated locally (documented only)." "AWS S3 Object Lock (WORM)" "Retention"
            bus     = container "bp-event-bus" "Business-event transport. RabbitMQ locally; EventBridge + SQS on AWS." "RabbitMQ / EventBridge+SQS" "Messaging"
        }

        # ==================================================================
        # RELATIONSHIPS
        # ==================================================================

        # --- Context level (actors <-> systems) ---
        cliente  -> bp "Queries information, transfers and pays" "HTTPS"
        operador -> bp "Queries audit and operational status" "HTTPS"
        bp -> idp    "Authenticates users (OIDC Authorization Code + PKCE)" "HTTPS/OIDC"
        bp -> core   "Queries and executes operations (system of record)" "HTTPS/mTLS"
        bp -> compl  "Retrieves detailed customer information" "HTTPS"
        bp -> facial "Verifies identity during onboarding (liveness + match)" "HTTPS"
        bp -> email  "Sends email notifications" "HTTPS"
        bp -> push   "Sends push notifications" "HTTPS"

        # --- Clients -> edge ---
        cliente -> spa    "Uses" "HTTPS"
        cliente -> mobile "Uses" "HTTPS"
        operador -> spa   "Queries" "HTTPS"
        spa    -> edge "Static delivery and API" "HTTPS"
        mobile -> edge "Consumes API" "HTTPS"
        edge   -> bff     "Routes web traffic" "HTTPS"
        edge   -> gateway "Routes mobile/API traffic" "HTTPS"

        # --- Authentication ---
        mobile   -> idp "Authorization Code + PKCE" "HTTPS/OIDC"
        bff      -> idp "Authorization Code + PKCE (server-side tokens)" "HTTPS/OIDC"
        bff      -> identity "Validates/renews session; maps permissions" "REST/mTLS"
        bff      -> redis "Stores the user session" "RESP/TLS"
        gateway  -> identity "Validates JWT (JWKS) and applies edge authorization" "REST/mTLS"
        identity -> idp "OIDC discovery and JWKS" "HTTPS/OIDC"
        identity -> bus "Publishes auth events (login ok/failed, step-up)" "AMQP / SQS"

        # --- Edge -> domains ---
        bff     -> gateway "Aggregates and forwards web calls" "REST/HTTPS (Bearer)"
        gateway -> customer     "Customer query" "REST/mTLS"
        gateway -> accounts     "Accounts/products query" "REST/mTLS"
        gateway -> movements    "Movements query" "REST/mTLS"
        gateway -> transferController "Creates/queries transfers" "REST/mTLS (Idempotency-Key)"
        gateway -> payment      "Creates/queries bill payments" "REST/mTLS (Idempotency-Key)"
        gateway -> onboarding   "Orchestrates onboarding" "REST/mTLS"

        # --- Read domains ---
        customer  -> coreint "Customer data from the Core" "REST/mTLS"
        customer  -> complint "Customer enrichment" "REST/mTLS"
        customer  -> redis "Profile cache-aside" "RESP/TLS"
        accounts  -> coreint "Accounts/products from the Core" "REST/mTLS"
        accounts  -> redis "Product cache-aside" "RESP/TLS"
        movements -> coreint "Movements from the Core" "REST/mTLS"
        movements -> redis "Movement-page cache-aside" "RESP/TLS"

        # --- Transfer (components) ---
        transferController -> createTransferUC "Invokes" ""
        transferController -> getStatusUC "Invokes" ""
        createTransferUC -> transferAggregate "Applies rules and transitions" ""
        createTransferUC -> idempotencyStore "Checks/registers Idempotency-Key" ""
        createTransferUC -> transferRepository "Persists order + Outbox (same TX)" ""
        createTransferUC -> corePort "Sends the transfer command" ""
        getStatusUC -> transferRepository "Reads the order state" ""
        reconciliationWorker -> transferRepository "Reads UNKNOWN/PENDING orders" ""
        reconciliationWorker -> corePort "Queries the real status" ""
        idempotencyStore -> aurora "INSERT with UNIQUE(idempotency_key) constraint" "SQL/TLS"
        transferRepository -> aurora "Reads/writes order, idempotency and Outbox (same ACID TX)" "SQL/TLS"
        outboxPublisher -> aurora "Reads pending Outbox" "SQL/TLS"
        outboxPublisher -> bus "Publishes bp.transfer.* (at-least-once)" "AMQP / SQS"
        corePort -> coreInboundApi "POST transfer / GET status" "REST/mTLS (Idempotency-Key)"

        # --- Payment (summarized at container level) ---
        payment -> coreint "Executes bill payment / queries status" "REST/mTLS (Idempotency-Key)"
        payment -> aurora "Payment state, idempotency keys (UNIQUE) and Outbox (same ACID TX)" "SQL/TLS"
        payment -> bus "Publishes bp.payment.*" "AMQP / SQS"

        # --- Core Integration (components) ---
        coreInboundApi -> aclTranslator "Normalizes request/response" ""
        aclTranslator -> coreClient "Executes the translated operation" ""
        aclTranslator -> statusQuery "Status lookup by reference" ""
        coreClient -> resilience "Applies circuit breaker/retry/timeout" ""
        statusQuery -> resilience "Applies circuit breaker/timeout" ""
        resilience -> core "Calls the Core Banking system" "HTTPS/mTLS"
        coreClient -> correlationRepo "Stores operation<->Core reference correlation" ""
        statusQuery -> correlationRepo "Resolves the Core reference" ""
        correlationRepo -> aurora "Reads/writes correlation" "SQL/TLS"

        # --- Complementary / Onboarding ---
        complint -> compl "Queries detailed data" "HTTPS"
        onboarding -> coreint "Creates the customer in the Core" "REST/mTLS"
        onboarding -> facial "Facial verification (liveness + match)" "HTTPS"
        onboarding -> bus "Publishes bp.onboarding.*" "AMQP / SQS"

        # --- Events: consumers ---
        bus -> notification "Delivers business events" "AMQP / SQS"
        bus -> audit "Delivers auditable events" "AMQP / SQS"
        notification -> email "Sends email" "HTTPS"
        notification -> push "Sends push" "HTTPS"
        notification -> aurora "Records deliveries" "SQL/TLS"
        audit -> aurora "Writes append-only operational log (chained hash)" "SQL/TLS"
        audit -> archive "Exports to protected retention (WORM)" "HTTPS"
        operador -> audit "Queries traceability" "REST/mTLS"
    }

    # ==================================================================
    # VIEWS
    # ==================================================================
    views {

        systemContext bp "C1-Contexto" "Level 1 - BP system context." {
            include *
            autolayout lr
        }

        container bp "C2-Contenedores" "Level 2 - BP platform containers." {
            include *
            autolayout tb
        }

        component transfer "C3-Transfer" "Level 3 - bp-transfer-service components." {
            include *
            autolayout lr
        }

        component coreint "C3-CoreIntegration" "Level 3 - bp-core-integration (ACL) components." {
            include *
            autolayout lr
        }

        styles {
            element "Persona" {
                shape person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "External" {
                background #8c8c8c
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "WebApp" {
                shape WebBrowser
                background #2e7d32
                color #ffffff
            }
            element "Mobile" {
                shape MobileDeviceLandscape
                background #2e7d32
                color #ffffff
            }
            element "Edge" {
                background #d4a017
                color #000000
            }
            element "Gateway" {
                background #f08c00
                color #000000
            }
            element "Security" {
                background #b22222
                color #ffffff
            }
            element "ACL" {
                background #6a1b9a
                color #ffffff
            }
            element "Domain" {
                background #438dd5
                color #ffffff
            }
            element "Database" {
                shape Cylinder
                background #1565c0
                color #ffffff
            }
            element "Retention" {
                shape Folder
                background #37474f
                color #ffffff
            }
            element "Messaging" {
                shape Pipe
                background #00838f
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            relationship "Relationship" {
                dashed false
            }
        }
    }
}
