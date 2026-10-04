# Planlayıcı

Google Takvim ile **iki yönlü senkronize** çalışan kişisel program uygulaması.

| Sayfa | Ne yapar |
|---|---|
| **Bugün** | Günün programı, bugünkü görevler, alışkanlıklar, boş zaman, "Günü akıllı planla" |
| **Takvim** | Ay / hafta / gün / liste görünümü, sürükle-bırak, tekrar eden etkinlikler, görevleri takvime sürükleme |
| **Görevler** | Listeler, öncelik, son tarih, süre, alt görevler, tekrarlayan görevler, Türkçe hızlı ekleme |
| **Alışkanlıklar** | Günlük/haftalık rutinler, seri (🔥), 16 haftalık ısı haritası |
| **Odak** | Pomodoro sayacı, göreve bağlı odak oturumları |
| **Günlük** | Günlük notlar ve ruh hali |
| **İstatistik** | Tamamlanan görev, odak süresi, takvim doluluğu, alışkanlık başarısı |
| **Ayarlar** | Google bağlantısı, çalışma saatleri, planlama, bildirimler, yedekleme |

**Akıllı planlama:** Tarihi olan ya da olmayan görevleri son tarih ve önceliğe göre sıralar. Ardından Google Takviminizdeki boş saatlere, çalışma saatleri ve etkinlikler arası tampon süreye uyarak yerleştirir. Oluşan zaman blokları Google Takviminize de eklenir.

**Hızlı ekleme örnekleri:**
- `Rapor yaz yarın 45dk !1 #iş`
- `Spor her gün 1s`
- `Fatura öde 15.10`

---

## 1. Kurulum

Gereken: [Node.js 20+](https://nodejs.org)

```bash
npm install
copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
npm run dev
```

Tarayıcıda **http://localhost:3000** adresini açın. Uygulama Google bağlantısı olmadan da çalışır. Bilgisayarda veriler `data/pglite` klasöründe tutulur; telefondan erişim için Bölüm 3'e bakın.

## 2. Google Takvim bağlantısı (adım adım)

Bu işlem yaklaşık 10 dakika sürer ve bir kez yapılır.

### Adım 1 — Proje oluştur
1. https://console.cloud.google.com/projectcreate adresine gidin. Google hesabınızla giriş yapın.
2. **Project name:** `Planlayici` → **Create**. Sağ üstteki bildirimden projeyi seçin.

### Adım 2 — Google Calendar API'yi aç
1. https://console.cloud.google.com/apis/library/calendar-json.googleapis.com adresine gidin.
2. Üstte doğru projenin seçili olduğundan emin olun → **Enable**.

### Adım 3 — OAuth onay ekranı
1. Sol menü: **APIs & Services → OAuth consent screen**. Yeni arayüzde adı **Google Auth Platform → Branding**.
2. **Get started** düğmesine basın ve şunları doldurun:
   - **App name:** `Planlayıcı`
   - **User support email:** kendi e-postanız
3. **Audience:** **External** seçin.
4. **Contact information:** kendi e-postanız → **Create**.
5. **Audience** sekmesi → **Test users** → **Add users** → kendi Gmail adresinizi ekleyin.
6. *(İsteğe bağlı)* **Data Access** → **Add or remove scopes** → `.../auth/calendar` kapsamını ekleyin. Uygulama bu kapsamı zaten kendisi istiyor; bu adım sadece onay ekranında açıklama göstermek içindir.

### Adım 4 — OAuth istemci kimliği
1. **APIs & Services → Credentials**. Yeni arayüzde adı **Clients**.
2. **Create credentials → OAuth client ID**:
   - **Application type:** `Web application`
   - **Name:** `Planlayici web`
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/google/callback`
3. **Create**. Açılan pencerede **Client ID** ve **Client secret** görünür; ikisini de kopyalayın.

### Adım 5 — Anahtarları uygulamaya ekle
Proje klasöründeki `.env.local` dosyasını açın:

```env
GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
APP_URL=http://localhost:3000
```

Sunucuyu yeniden başlatın: terminalde `Ctrl+C`, ardından `npm run dev`.

### Adım 6 — Bağlan
1. Uygulamada **Ayarlar → Google hesabını bağla**.
2. "Google bu uygulamayı doğrulamadı" uyarısı çıkarsa **Gelişmiş → Planlayıcı'ya git (güvenli değil)** seçeneğine tıklayın. Bunu kendi oluşturduğunuz uygulama için yaptığınızdan sorun yoktur.
3. Takvim iznini onaylayın. İlk senkron otomatik yapılır.

### Bilmeniz gerekenler
- **7 günlük oturum:** OAuth uygulaması "Testing" modundayken Google, bağlantıyı 7 günde bir sonlandırır. Ayarlar'da "yeniden bağlanın" uyarısı görürseniz tekrar bağlanmanız yeterli. Kalıcı çözüm: **Audience → Publish app → In production**. Kişisel kullanımda Google doğrulaması gerekmez, sadece uyarı ekranı görünmeye devam eder.
- **Senkron zamanlaması:** Uygulama açıkken 5 dakikada bir otomatik senkronize olur. Kenar çubuğundaki ↻ simgesi ile elle de senkronize edebilirsiniz.
- **Birden fazla takvim:** Ayarlar → Takvimler bölümünden hangi Google takvimlerinin senkronize edileceğini seçebilir, yeni etkinliklerin ve akıllı planlamanın hangi takvime yazılacağını belirleyebilirsiniz. Seçili tüm takvimlerdeki etkinlikler planlamada dolu saat sayılır. Salt okunur takvimler (ör. resmi tatiller) görüntülenir ama düzenlenemez. Takvim sayfasının kenar çubuğundan takvimleri geçici olarak gizleyebilirsiniz.
- **Bağlantıyı kesmek** Google'daki etkinliklere dokunmaz; yalnızca uygulamadaki kopyalarını kaldırır.

## 3. Telefondan erişim: Supabase + Vercel (ücretsiz)

Uygulama internette çalışır; telefondan ve bilgisayardan aynı verilere erişirsiniz. Supabase ve Vercel'in ücretsiz planları kredi kartı istemez.

### Adım 1 — Supabase veritabanı
1. https://supabase.com → **Start your project** → GitHub ile giriş yapın.
2. **New project**:
   - **Name:** `planlayici`
   - **Database Password:** güçlü bir şifre belirleyin ve **bir yere kaydedin**
   - **Region:** `Central EU (Frankfurt)` (Türkiye'ye en yakın bölge)
   - **Plan:** Free
3. Proje hazır olunca (1–2 dk) üstteki **Connect** düğmesine basın. **Transaction pooler** bölümündeki bağlantı adresini kopyalayın ve `[YOUR-PASSWORD]` yerine 2. maddedeki şifreyi yazın:
   ```
   postgresql://postgres.abcd1234:SIFRENIZ@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
   Tablolar uygulama ilk açıldığında otomatik oluşturulur.

> Supabase ücretsiz projeleri 7 gün hiç kullanılmazsa duraklatır. Uygulama her gün kendiliğinden küçük bir istek attığı için (Vercel Cron) bu olmaz. Yine de duraklarsa Supabase panelinden **Restore** ile geri açılır; veriler silinmez.

### Adım 2 — Vercel'e yayınlama
1. https://vercel.com/signup → **Hobby** → GitHub ile giriş yapın.
2. Proje klasöründe terminali açın:
   ```bash
   npx vercel login
   npx vercel
   ```
   Sorulara Enter ile varsayılan cevapları verin; proje adı `planlayici` olsun. Sonunda size `https://planlayici-xxxx.vercel.app` gibi bir adres verilir.
3. Vercel panelinde → projeniz → **Settings → Environment Variables** bölümüne şunları ekleyin:

   | Değişken | Değer |
   |---|---|
   | `DATABASE_URL` | Supabase bağlantı adresi (Adım 1.3) |
   | `APP_URL` | `https://planlayici-xxxx.vercel.app` (size verilen adres) |
   | `APP_PASSWORD` | Uygulamaya giriş şifreniz (**önerilir**; boş bırakırsanız adresi bilen herkes girebilir) |
   | `APP_TIMEZONE` | `Europe/Istanbul` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google anahtarları (Bölüm 2) |
   | `CRON_SECRET` | Rastgele uzun bir metin |

4. Değişkenlerin geçerli olması için tekrar yayınlayın: `npx vercel --prod`
5. Google Cloud Console → Credentials → OAuth istemciniz → şunları **ekleyin**:
   - Authorized JavaScript origins: `https://planlayici-xxxx.vercel.app`
   - Authorized redirect URIs: `https://planlayici-xxxx.vercel.app/api/google/callback`

### Adım 3 — Telefona ekleme
Adresi telefonda açın, şifreyle girin ve ana ekrana ekleyin:
- **iPhone (Safari):** Paylaş → **Ana Ekrana Ekle**
- **Android (Chrome):** ⋮ menüsü → **Ana ekrana ekle**

## 4. Teknik notlar
- **Teknoloji:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, FullCalendar 6, PostgreSQL
- **Veritabanı:** `DATABASE_URL` tanımlıysa PostgreSQL'e (Supabase) bağlanır. Boşsa bilgisayarda kurulum gerektirmeyen yerel PostgreSQL (PGlite, `data/pglite`) kullanılır.
- **Saat dilimi:** Sunucu hesapları `APP_TIMEZONE` ile yapılır (varsayılan `Europe/Istanbul`); Vercel'in UTC sunucularında da doğru çalışır.
- **Güvenlik:** Geliştirme sunucusu yalnızca `127.0.0.1` adresinde dinler. Google anahtarları ve oturum bilgileri sadece sunucu tarafında saklanır; `data/` ve `.env.local` git'e eklenmez.
- **Yedekleme:** Ayarlar → *Verileri yedekle (JSON)*
