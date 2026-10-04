# Planlayıcı Tasarım Sistemi (MASTER)

ui-ux-pro-max skill'inin önerileriyle oluşturuldu. Sayfaya özel kurallar `design-system/pages/<sayfa>.md` dosyasında bu dosyayı ezer.

## Ürün
- Tür: öğrenci odaklı kişisel verimlilik ve gün planlama uygulaması
- Ton: sakin ama enerjik; kullanıcıyı ders çalışmaya ve görevlere yönlendiren, ilerlemeyi ödüllendiren
- Stil: **Soft UI Evolution** — yumuşak gölgeler, net kontrast, abartısız süsleme (WCAG AA+)

## Renk tokenları (globals.css `:root` / `.dark`)
| Rol | Açık | Koyu | Kullanım |
|---|---|---|---|
| `--primary` | #2563EB | #3B82F6 | Ana eylem, aktif menü, odak |
| `--primary-soft` | #DBEAFE | rgba(59,130,246,.16) | Seçili arka planlar |
| `--success` | #059669 | #10B981 | Tamamlanan, odak oturumu, XP |
| `--streak` | #EA580C | #F97316 | Seri (ateş), en önemli 3 iş |
| `--danger` | #DC2626 | #F87171 | Silme, gecikme |
| `--bg` | #F8FAFC | #0B1120 | Sayfa |
| `--panel` | #FFFFFF | #111827 | Kart |
| `--panel-2` | #F1F5F9 | #1E293B | İç yüzey, ilerleme izi |
| `--border` | #E2E8F0 | #1F2A3C | Ayraç |
| `--text` | #0F172A | #E2E8F0 | Metin (≥ 4.5:1) |
| `--muted` | #64748B | #94A3B8 | İkincil metin (≥ 4.5:1 / 3:1) |

Bileşenlerde ham hex kullanılmaz; renkler tokenlardan ya da `brand-*` Tailwind renklerinden gelir.

## Tipografi
- Yazı tipi: **Plus Jakarta Sans** (next/font, latin + latin-ext, `display: swap`)
- Ölçek: 12 · 14 · 16 · 18 · 24 · 30; gövde 14–16, satır yüksekliği 1.5
- Ağırlık: başlık 700, alt başlık 600, etiket 500, gövde 400
- Sayılar ve sayaçlar: `tabular-nums`

## Boşluk, köşe, gölge
- 4/8 px ritmi; kart iç boşluğu 16–20, bölümler arası 24
- Köşe: kart 16 (rounded-2xl), düğme ve giriş 12 (rounded-xl), çip tam yuvarlak
- Gölge: `--shadow-sm` kart, `--shadow-md` açılır pencere; koyu temada gölge yerine kenarlık

## Etkileşim
- Dokunma alanı ≥ 44 px (dokunmatik cihazda düğmeler en az 44 px)
- Görünür odak çerçevesi: 2 px `--primary`, 2 px boşluk
- Geçişler 150–250 ms, ease-out; `prefers-reduced-motion` açıksa animasyon yok
- Tıklanabilir her öğe `cursor: pointer`
- Her ekranda tek birincil eylem (mavi düğme)

## İkonlar
- Yalnızca lucide-react (çizgi 2 px). Arayüz yapısında emoji kullanılmaz; emoji yalnızca kullanıcının girdiği içerikte (alışkanlık simgesi, ruh hali) görünür.

## Motivasyon dili
- XP ve seviye: görev, odak dakikası, alışkanlık ve ritüeller XP kazandırır
- Seri: arka arkaya plan yapılan ya da odaklanılan günler (turuncu ateş)
- Günlük hedef halkası: günün en önemli işleri + odak dakikası
- Odak fidanı: odak süresince büyür, yarıda bırakılırsa solar (Forest esinli)
- Kutlama: en önemli bir iş bittiğinde ya da seviye atlandığında kısa konfeti (hareket azaltılmışsa yok)

## Kaçınılacaklar
- Aşırı süsleme, gradyan yığınları, hareket eden arka planlar
- Yalnızca renkle anlam verme (ikon ya da metin ekle)
- Alt menüde 5'ten fazla öğe
