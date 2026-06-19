$env_vars = @{
  "MONGODB_URI" = "mongodb+srv://dogukansark44_db_user:kZgdnxHB71tY19mD@cluster0.13wk5rz.mongodb.net/?appName=Cluster0"
  "SITE_URL" = "https://qrweb-coral.vercel.app"
  "ADMIN_PASSWORD" = "123456"
  "ADMIN_JWT_SECRET" = "qrweb-jwt-secret-gizli-anahtar-2024-asmalambalaj"
  "PAYTR_MERCHANT_ID" = ""
  "PAYTR_MERCHANT_KEY" = ""
  "PAYTR_MERCHANT_SALT" = ""
  "PAYTR_TEST_MODE" = "1"
  "PAYTR_MOCK" = "true"
  "MIN_ORDER_AMOUNT" = "1500"
  "FREE_SHIPPING_LIMIT" = "999999"
  "SHIPPING_FEE" = "150"
  "IBAN_DISCOUNT_PERCENT" = "2"
  "IBAN_NUMBER" = "TR00 0000 0000 0000 0000 0000 00"
  "IBAN_BANK" = "Garanti BBVA"
  "IBAN_ACCOUNT_NAME" = "Asmalı Ambalaj Tic. Ltd. Şti."
}

foreach ($key in $env_vars.Keys) {
  $val = $env_vars[$key]
  Write-Host "Setting $key..."
  npx vercel env add $key production --value "$val" --yes
  npx vercel env add $key preview --value "$val" --yes
  npx vercel env add $key development --value "$val" --yes
}
