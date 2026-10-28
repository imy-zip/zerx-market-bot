
'use strict';

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  MediaGalleryBuilder,
  TextDisplayBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');

// ========================================
// CONFIGURATION ZERX MARKET
// ========================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const GUILD_ID =
  process.env.GUILD_ID || '1195047756910309456';

const OWNER_ID = '1195042683064942624';

const TICKET_CHANNEL_ID = '1195054777025958008';
const CATALOG_CHANNEL_ID = '1195054550588076176';

const SERVER_INVITE = 'https://discord.gg/zYCc9fDZ3C';

const PREMIUM_BLUE = 0x254C91;

const SESSION_TIMEOUT = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const sessions = new Map();
const catalogSessions = new Map();
const completedPreviews = new Set();

if (!TOKEN || !CLIENT_ID) {
  throw new Error(
    'DISCORD_TOKEN et CLIENT_ID sont obligatoires.'
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ========================================
// FONCTIONS UTILES
// ========================================

function getSession() {
  const s = sessions.get(OWNER_ID);

  if (!s) return null;

  if (Date.now() - s.updated > SESSION_TIMEOUT) {
    sessions.delete(OWNER_ID);
    return null;
  }

  return s;
}

function touch(s) {
  s.updated = Date.now();
}

function buttons(...items) {
  return new ActionRowBuilder().addComponents(
    items.map(([id, label, style]) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
    )
  );
}

function safe(value) {
  return String(value || '')
    .replace(/@everyone/g, '@ everyone')
    .replace(/@here/g, '@ here')
    .replace(/<@/g, '< @')
    .trim();
}

function esc(value) {
  return safe(value)
    .replace(/\\/g, '\\\\')
    .replace(/([\[\]()*_~`>|])/g, '\\$1');
}

function money(value) {
  const amount = esc(value)
    .replace(/\n/g, ' ')
    .trim();

  return amount.includes('€')
    ? amount
    : amount + '€';
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    const parsed = new URL(raw);

    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function rfTitle(s) {
  const site = esc(s.site)
    .toUpperCase()
    .replace(/\n/g, ' ');

  const title = s.siteUrl
    ? `[${site}](${s.siteUrl})`
    : site;

  return `${title} - ${money(s.amount)}`;
}

function imageOf(message) {
  return message.attachments.find(
    a =>
      a.contentType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|webp|gif)$/i.test(a.name || '')
  );
}

function extOf(attachment) {
  return /\.(png|jpg|jpeg|webp|gif)$/i
    .exec(attachment.name || '')?.[1]
    ?.toLowerCase() || 'png';
}

// ========================================
// PHOTOS
// ========================================

async function prepPhoto(attachment) {
  if (attachment.size > MAX_IMAGE_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error('Téléchargement impossible');
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  return {
    buffer,
    url: attachment.url,
    ext: extOf(attachment)
  };
}

function prepared(s) {
  const files = [];
  const urls = [];

  s.photos.forEach((photo, index) => {
    const name =
      `zerx-market-${index + 1}.${photo.ext}`;

    files.push(
      new AttachmentBuilder(photo.buffer, { name })
    );

    urls.push(`attachment://${name}`);
  });

  return { files, urls };
}

function gallery(urls) {
  const g = new MediaGalleryBuilder();

  urls.forEach(url =>
    g.addItems(item => item.setURL(url))
  );

  return g;
}

// ========================================
// DESIGN VOUCH RF
// ========================================

function buildRF(s, urls) {
  const c = new ContainerBuilder();

  c.addMediaGalleryComponents(gallery(urls));

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${rfTitle(s)}`
    )
  );

  if (s.comment?.trim()) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `💬 ${safe(s.comment)}`
      )
    );
  }

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('\u200B')
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '**Liens utiles :**',
      '',
      `🛒 Liste boutiques : <#${CATALOG_CHANNEL_ID}>`,
      `📩 Me contacter : <#${TICKET_CHANNEL_ID}>`,
      `📢 Partager le serveur : ${SERVER_INVITE}`
    ].join('\n'))
  );

  return [c];
}

// ========================================
// DESIGN VOUCH UE
// ========================================

function buildUE(s, urls) {
  const c = new ContainerBuilder();

  c.addMediaGalleryComponents(gallery(urls));

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**🍕 Nouvelle livraison terminée !**'
    )
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('\u200B')
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `👤 **Client :** ${esc(s.clientName)}`,
      '',
      `👨‍🍳 **Cuisto :** ${esc(s.cook)}`,
      '',
      `🍔 **Restaurant :** ${esc(s.restaurant)}`,
      '',
      `💵 **Total :** ${money(s.price)}`,
      '',
      `📝 **Avis Client :** ${esc(s.notes)}`
    ].join('\n'))
  );

  return [c];
}

function buildVouch(s, urls) {
  return s.type === 'UE'
    ? buildUE(s, urls)
    : buildRF(s, urls);
}

// ========================================
// CONTRÔLES VOUCH
// ========================================

function vouchControls(s) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('zm:channel')
    .setPlaceholder('📢 Choisir le salon de publication')
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setMinValues(1)
    .setMaxValues(1);

  if (s.targetChannelId) {
    menu.setDefaultChannels(s.targetChannelId);
  }

  return [
    new ActionRowBuilder().addComponents(menu),

    buttons(
      ['zm:confirm', 'Confirmer', ButtonStyle.Success],
      ['zm:cancel', 'Annuler', ButtonStyle.Danger]
    )
  ];
}

async function showPreview(channel, s) {
  s.step = 'processing';
  touch(s);

  const message = await channel.send({
    flags: MessageFlags.IsComponentsV2,

    components: [
      new TextDisplayBuilder().setContent(
        `### 👀 Prévisualisation du vouch ${s.type}`
      ),

      ...buildVouch(
        s,
        s.photos.map(photo => photo.url)
      ),

      new TextDisplayBuilder().setContent(
        '📢 **Choisis le salon de publication, puis confirme.**'
      ),

      ...vouchControls(s)
    ],

    allowedMentions: { parse: [] }
  });

  s.previewMessageId = message.id;
  s.step = 'preview';

  touch(s);
}

function field(
  id,
  label,
  placeholder,
  max = 100,
  required = true,
  paragraph = false,
  initial = ''
) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(
      paragraph
        ? TextInputStyle.Paragraph
        : TextInputStyle.Short
    )
    .setMaxLength(max)
    .setRequired(required);

  if (placeholder) {
    input.setPlaceholder(placeholder);
  }

  if (initial) {
    input.setValue(initial);
  }

  return new ActionRowBuilder().addComponents(input);
}

// ========================================
// COMMANDES
// ========================================

const commands = [
  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Créer un vouch Zerx Market'),

  new SlashCommandBuilder()
    .setName('message')
    .setDescription(
      'Publier le catalogue Premium Zerx Market'
    )
];

// ========================================
// CATALOGUE COMPLET - 199 ENTRÉES
// ========================================

const CATALOG = [
  {
    title: '👕 Mode',
    subtitle: 'Prêt-à-porter, sneakers & accessoires',
    shops: [
      'Adidas',
      'COS',
      'Mango',
      'Ralph Lauren',
      'Zara',
      'H&M',
      'Shein',
      'Zalando',
      'ASOS',
      'Farfetch',
      'Lacoste',
      'Calvin Klein',
      "Levi's",
      'Carhartt',
      'Timberland',
      'Foot Locker',
      'Hollister',
      'Abercrombie',
      'Bershka',
      'Pull&Bear',
      'Boohoo',
      'PrettyLittleThing',
      "Victoria's Secret",
      'Dr. Martens',
      'Michael Kors',
      'The Kooples',
      'AllSaints',
      'About You',
      'Jaded London',
      'Four Amsterdam',
      'Arte Antwerp',
      'Daily Paper',
      'Axel Arigato',
      'Gerard Darel',
      'Eden Park',
      'Celio',
      'Izac',
      'Kipling',
      'Loavies',
      'Lounge',
      'Lyle & Scott',
      'Boozt',
      'Glamood',
      'Ray-Ban',
      'Sunglass Hut',
      'Oakley',
      'Mia Burton',
      'Samsonite',
      'Lipault',
      'American Tourister',
      'Eastpak',
      'Reima',
      'Scuffers',
      'Cavallaro Napoli',
      'J Crew',
      "Arc'Teryx",
      'GOAT',
      'StockX',
      '4Elementos',
      'Zadig & Voltaire',
      'La Redoute'
    ]
  },

  {
    title: '💻 High-Tech & Gaming',
    subtitle: 'Technologie, gaming & équipements',
    shops: [
      'Amazon',
      'Apple',
      'MemoryPC',
      'PlayStation',
      'Back Market',
      'JoyBuy',
      'Asus',
      'Lenovo',
      'Logitech',
      'Dyson',
      'JBL',
      'Bose',
      'Kef',
      'Bowers & Wilkins',
      'Canon',
      'Ring',
      'Eufy',
      'Arlo',
      'Epson',
      'KitchenAid',
      'Moulinex',
      'Ninja Kitchen',
      'Shark Ninja',
      'Tineco',
      'Bissell',
      'Bambu Lab',
      'Oral-B',
      'Oura Ring',
      'Wooting',
      'Meta',
      'Even Realities',
      'Eardopes',
      'Mous',
      'MovaTech',
      'Garmin',
      'SteamOne'
    ]
  },

  {
    title: '💎 Luxe',
    subtitle: 'Maisons de luxe & créateurs',
    shops: [
      'Tiffany & Co.',
      'Prada',
      'Coach',
      'Balenciaga',
      'Moncler',
      'Fendi',
      'Givenchy',
      'Dolce & Gabbana',
      'Bottega Veneta',
      'Celine',
      'Christian Louboutin',
      'Alexander McQueen',
      'Maison Margiela',
      'Jacquemus',
      'Golden Goose',
      'Jimmy Choo',
      'Lanvin',
      'Casablanca',
      'MCM',
      'Rimowa',
      'Messika',
      'Selfridges',
      'Four Seasons Shop',
      'LeMaire',
      'Canada Goose',
      'Net-a-Porter'
    ]
  },

  {
    title: '💄 Beauté & Bien-être',
    subtitle: 'Parfums, cosmétiques & soins',
    shops: [
      'Sephora',
      'Nocibé',
      "Victoria's Secret",
      'Lounge',
      'Rituals',
      'Lancôme',
      'Aesop',
      'Kylie Cosmetics',
      'Creed',
      'Parfums de Marly',
      'Kilian Paris',
      'Jo Malone',
      'Chogan',
      'Fragrance',
      'Manscaped',
      'Flaconi'
    ]
  },

  {
    title: '🏋️ Sport & Musculation',
    subtitle: 'Performance, fitness & outdoor',
    shops: [
      'Lululemon',
      'Alo Yoga',
      'On Running',
      'Teveo',
      'Gymshark',
      'NutriMuscle',
      'Esprit Padel Shop',
      'Nike',
      'Adidas',
      'Puma',
      'New Balance',
      'Asics',
      'JD Sports',
      'Patagonia',
      'Venum',
      'GymBeam',
      'Dragon Bleu',
      'NBA Store',
      'Golf Galaxy',
      'SnowLeader',
      'DopeSnow',
      'Nocta',
      'Decathlon',
      'Alpiniste'
    ]
  },

  {
    title: '💍 Bijoux & Horlogerie',
    subtitle: 'Bijoux, montres & accessoires précieux',
    shops: [
      'Tiffany & Co.',
      '58 Facettes',
      'Pandora',
      'Swarovski',
      'Marc-Orian',
      'Tissot',
      'Fossil',
      'Paul Valentine',
      'Isabel Bernard',
      'G-Shock'
    ]
  },

  {
    title: '🏠 Maison & Lifestyle',
    subtitle: 'Maison, décoration & quotidien',
    shops: [
      'Wine in Black',
      'KitchenAid',
      'Moulinex',
      'Boutique Stanley',
      'Home24',
      'Arlo',
      'Eufy',
      'Ring',
      'Zooplus',
      'Maxi Zoo',
      'Onyx Cookware',
      'ManoMano',
      'Nespresso'
    ]
  },

  {
    title: '🎁 Divers',
    subtitle: 'Découvertes, cadeaux & autres boutiques',
    shops: [
      'Amazon',
      'PayPal',
      'LEGO',
      'Funko',
      'Magic Madhouse',
      'Pokémon Center',
      'Thomann',
      'Bax Music',
      'Ekster',
      'Aniioki',
      'Le Petit Vapoteur',
      'Air Up',
      'AliExpress'
    ]
  }
];

// ========================================
// LIENS DES BOUTIQUES
// ========================================

const SHOP_LINKS = {
  // MODE
  'Adidas': 'https://www.adidas.fr',
  'COS': 'https://www.cos.com',
  'Mango': 'https://shop.mango.com',
  'Ralph Lauren': 'https://www.ralphlauren.fr',
  'Zara': 'https://www.zara.com/fr/',
  'H&M': 'https://www2.hm.com/fr_fr/index.html',
  'Shein': 'https://fr.shein.com',
  'Zalando': 'https://www.zalando.fr',
  'ASOS': 'https://www.asos.com/fr/',
  'Farfetch': 'https://www.farfetch.com/fr/',
  'Lacoste': 'https://www.lacoste.com/fr/',
  'Calvin Klein': 'https://www.calvinklein.fr',
  "Levi's": 'https://www.levi.com/FR/fr_FR/',
  'Carhartt': 'https://www.carhartt-wip.com/fr',
  'Timberland': 'https://www.timberland.fr',
  'Foot Locker': 'https://www.footlocker.fr',
  'Hollister': 'https://www.hollisterco.com',
  'Abercrombie': 'https://www.abercrombie.com',
  'Bershka': 'https://www.bershka.com',
  'Pull&Bear': 'https://www.pullandbear.com',
  'Boohoo': 'https://fr.boohoo.com',
  'PrettyLittleThing': 'https://www.prettylittlething.fr',
  "Victoria's Secret": 'https://www.victoriassecret.com',
  'Dr. Martens': 'https://www.drmartens.com/fr/fr/',
  'Michael Kors': 'https://www.michaelkors.fr',
  'The Kooples': 'https://www.thekooples.com',
  'AllSaints': 'https://www.allsaints.com',
  'About You': 'https://www.aboutyou.fr',
  'Jaded London': 'https://jadedldn.com',
  'Four Amsterdam': 'https://www.fouramsterdam.com/',
  'Arte Antwerp': 'https://arte-antwerp.com',
  'Daily Paper': 'https://dailypaperclothing.com',
  'Axel Arigato': 'https://axelarigato.com',
  'Gerard Darel': 'https://gerarddarel.com',
  'Eden Park': 'https://www.eden-park.com',
  'Celio': 'https://www.celio.com',
  'Izac': 'https://www.izac.fr',
  'Kipling': 'https://www.kipling.com',
  'Loavies': 'https://www.loavies.com',
  'Lounge': 'https://fr.lounge.com/',
  'Lyle & Scott': 'https://www.lyleandscott.com',
  'Boozt': 'https://www.boozt.com',
  'Glamood': 'https://www.glamood.com',
  'Ray-Ban': 'https://www.ray-ban.com',
  'Sunglass Hut': 'https://www.sunglasshut.com',
  'Oakley': 'https://www.oakley.com',
  'Mia Burton': 'https://miaburton.com/',
  'Samsonite': 'https://www.samsonite.fr',
  'Lipault': 'https://www.lipault.fr',
  'American Tourister': 'https://www.americantourister.fr',
  'Eastpak': 'https://www.eastpak.com',
  'Reima': 'https://www.reima.com',
  'Scuffers': 'https://scuffers.com/',
  'Cavallaro Napoli': 'https://www.cavallaronapoli.com/',
  'J Crew': 'https://www.jcrew.com',
  "Arc'Teryx": 'https://arcteryx.com',
  'GOAT': 'https://www.goat.com',
  'StockX': 'https://stockx.com',
  '4Elementos': 'https://4elementos.fr/',
  'Zadig & Voltaire': 'https://zadig-et-voltaire.com',
  'La Redoute': 'https://www.laredoute.fr/',

  // HIGH-TECH
  'Amazon': 'https://www.amazon.fr',
  'Apple': 'https://www.apple.com/fr/',
  'MemoryPC': 'https://www.memorypc.fr',
  'PlayStation': 'https://www.playstation.com/fr-fr/',
  'Back Market': 'https://www.backmarket.fr',
  'JoyBuy': 'https://www.joybuy.fr/',
  'Asus': 'https://www.asus.com/fr/',
  'Lenovo': 'https://www.lenovo.com/fr/fr/',
  'Logitech': 'https://www.logitech.com/fr-fr',
  'Dyson': 'https://www.dyson.fr',
  'JBL': 'https://fr.jbl.com',
  'Bose': 'https://www.bose.fr',
  'Kef': 'https://fr.kef.com',
  'Bowers & Wilkins': 'https://www.bowerswilkins.com',
  'Canon': 'https://www.canon.fr',
  'Ring': 'https://fr-fr.ring.com',
  'Eufy': 'https://www.eufy.com',
  'Arlo': 'https://www.arlo.com',
  'Epson': 'https://www.epson.fr',
  'KitchenAid': 'https://www.kitchenaid.fr',
  'Moulinex': 'https://www.moulinex.fr',
  'Ninja Kitchen': 'https://ninjakitchen.fr',
  'Shark Ninja': 'https://sharkclean.fr',
  'Tineco': 'https://fr.tineco.com',
  'Bissell': 'https://www.bissell.fr',
  'Bambu Lab': 'https://bambulab.com',
  'Oral-B': 'https://www.oralb.fr',
  'Oura Ring': 'https://ouraring.com',
  'Wooting': 'https://wooting.io',
  'Meta': 'https://www.meta.com',
  'Even Realities': 'https://www.evenrealities.com',
  'Eardopes': 'https://eardopes.fr/',
  'Mous': 'https://www.mous.co',
  'MovaTech': 'https://fr.mova.tech/',
  'Garmin': 'https://www.garmin.com/fr-FR/',
  'SteamOne': 'https://steam-one.com/',

  // LUXE
  'Tiffany & Co.': 'https://www.tiffany.fr',
  'Prada': 'https://www.prada.com',
  'Coach': 'https://fr.coach.com',
  'Balenciaga': 'https://www.balenciaga.com',
  'Moncler': 'https://www.moncler.com',
  'Fendi': 'https://www.fendi.com',
  'Givenchy': 'https://www.givenchy.com',
  'Dolce & Gabbana': 'https://www.dolcegabbana.com',
  'Bottega Veneta': 'https://www.bottegaveneta.com',
  'Celine': 'https://www.celine.com',
  'Christian Louboutin': 'https://eu.christianlouboutin.com',
  'Alexander McQueen': 'https://www.alexandermcqueen.com',
  'Maison Margiela': 'https://www.maisonmargiela.com',
  'Jacquemus': 'https://www.jacquemus.com',
  'Golden Goose': 'https://www.goldengoose.com',
  'Jimmy Choo': 'https://www.jimmychoo.com',
  'Lanvin': 'https://www.lanvin.com',
  'Casablanca': 'https://casablancaparis.com',
  'MCM': 'https://fr.mcmworldwide.com',
  'Rimowa': 'https://www.rimowa.com',
  'Messika': 'https://www.messika.com',
  'Selfridges': 'https://www.selfridges.com',
  'Four Seasons Shop': 'https://shop.fourseasons.com',
  'LeMaire': 'https://www.lemaire.fr',
  'Canada Goose': 'https://www.canadagoose.com',
  'Net-a-Porter': 'https://www.net-a-porter.com',

  // BEAUTÉ
  'Sephora': 'https://www.sephora.fr',
  'Nocibé': 'https://www.nocibe.fr',
  'Rituals': 'https://www.rituals.com',
  'Lancôme': 'https://www.lancome.fr',
  'Aesop': 'https://www.aesop.com',
  'Kylie Cosmetics': 'https://kyliecosmetics.com',
  'Creed': 'https://www.creedfragrance.fr',
  'Parfums de Marly': 'https://parfums-de-marly.com',
  'Kilian Paris': 'https://www.bykilian.com',
  'Jo Malone': 'https://www.jomalone.fr',
  'Chogan': 'https://www.chogangroupspa.com',
  'Fragrance': 'https://fragrance-and-co.com/',
  'Manscaped': 'https://www.manscaped.com',
  'Flaconi': 'https://www.flaconi.fr/',

  // SPORT
  'Lululemon': 'https://www.lululemon.com',
  'Alo Yoga': 'https://www.aloyoga.com',
  'On Running': 'https://www.on.com',
  'Teveo': 'https://teveo.com',
  'Gymshark': 'https://fr.gymshark.com',
  'NutriMuscle': 'https://www.nutrimuscle.com',
  'Esprit Padel Shop': 'https://esprit-padel-shop.com/',
  'Nike': 'https://www.nike.com/fr',
  'Puma': 'https://eu.puma.com/fr/fr',
  'New Balance': 'https://www.newbalance.fr',
  'Asics': 'https://www.asics.com/fr/fr-fr/',
  'JD Sports': 'https://www.jdsports.fr',
  'Patagonia': 'https://eu.patagonia.com/fr/fr/',
  'Venum': 'https://fr.venum.com',
  'GymBeam': 'https://gymbeam.fr',
  'Dragon Bleu': 'https://www.dragonbleu.fr',
  'NBA Store': 'https://www.nbastore.eu',
  'Golf Galaxy': 'https://www.golfgalaxy.com',
  'SnowLeader': 'https://www.snowleader.com',
  'DopeSnow': 'https://www.dopesnow.com',
  'Nocta': 'https://www.nocta.com',
  'Decathlon': 'https://www.decathlon.fr/',
  'Alpiniste': 'https://www.alpiniste.fr/',

  // BIJOUX
  '58 Facettes': 'https://58facettes.fr',
  'Pandora': 'https://fr.pandora.net',
  'Swarovski': 'https://www.swarovski.com',
  'Marc-Orian': 'https://www.marc-orian.com',
  'Tissot': 'https://www.tissotwatches.com',
  'Fossil': 'https://www.fossil.com/fr-fr/',
  'Paul Valentine': 'https://www.paul-valentine.com',
  'Isabel Bernard': 'https://www.isabelbernard.com',
  'G-Shock': 'https://gshock.casio.com',

  // MAISON
  'Wine in Black': 'https://www.wine-in-black.fr',
  'Boutique Stanley': 'https://eu.stanley1913.com',
  'Home24': 'https://www.home24.fr',
  'Zooplus': 'https://www.zooplus.fr',
  'Maxi Zoo': 'https://www.maxizoo.fr',
  'Onyx Cookware': 'https://onyxcookware.fr/',
  'ManoMano': 'https://www.manomano.fr/',
  'Nespresso': 'https://www.nespresso.com/fr/fr/',

  // DIVERS
  'PayPal': 'https://www.paypal.com/fr/home',
  'LEGO': 'https://www.lego.com/fr-fr',
  'Funko': 'https://funko.com',
  'Magic Madhouse': 'https://magicmadhouse.co.uk',
  'Pokémon Center': 'https://www.pokemoncenter.com',
  'Thomann': 'https://www.thomann.de/fr/',
  'Bax Music': 'https://www.bax-shop.fr',
  'Ekster': 'https://www.ekster.com',
  'Aniioki': 'https://aniioki.com/',
  'Le Petit Vapoteur': 'https://www.lepetitvapoteur.com',
  'Air Up': 'https://shop.air-up.com/fr/fr',
  'AliExpress': 'https://fr.aliexpress.com/'
};

// ========================================
// CATALOGUE PREMIUM - COMPONENTS V2
// ========================================

// Les Components V2 permettent :
// - de vrais conteneurs bleus
// - des séparateurs natifs
// - des titres hiérarchisés
// - des boutons de navigation
// - des boutiques cliquables

function ticket() {
  return `<#${TICKET_CHANNEL_ID}>`;
}

function ticketUrl() {
  return (
    `https://discord.com/channels/` +
    `${GUILD_ID}/${TICKET_CHANNEL_ID}`
  );
}

function shopLine(name) {
  const link = SHOP_LINKS[name];

  const label = name.replace(
    /([\\*_[\]`~])/g,
    '\\$1'
  );

  if (link) {
    return `• [**${label}**](${link})`;
  }

  return `• **${label}**`;
}

function premiumContainer() {
  return new ContainerBuilder()
    .setAccentColor(PREMIUM_BLUE);
}

function addText(container, text) {
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text)
  );

  return container;
}

function addSeparator(container) {
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  return container;
}

function ticketButton() {
  return new ButtonBuilder()
    .setLabel('Ouvrir un ticket')
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Link)
    .setURL(ticketUrl());
}

function catalogButton() {
  return new ButtonBuilder()
    .setLabel('Voir le catalogue')
    .setEmoji('📚')
    .setStyle(ButtonStyle.Link)
    .setURL(
      `https://discord.com/channels/` +
      `${GUILD_ID}/${CATALOG_CHANNEL_ID}`
    );
}

function serverButton() {
  return new ButtonBuilder()
    .setLabel('Partager le serveur')
    .setEmoji('💙')
    .setStyle(ButtonStyle.Link)
    .setURL(SERVER_INVITE);
}

// ========================================
// INTRODUCTION PREMIUM
// ========================================

function premiumIntro() {
  const c = premiumContainer();

  addText(
    c,
    [
      '## 💎 ZERX MARKET',
      '### CATALOGUE OFFICIEL',
      '',
      '*Votre sélection de boutiques, réunie au même endroit.*'
    ].join('\n')
  );

  addSeparator(c);

  addText(
    c,
    [
      'Bienvenue dans le catalogue **Zerx Market**.',
      '',
      'Découvrez les boutiques disponibles à travers nos **8 catégories**.',
      '',
      '✦ **199 entrées** dans le catalogue',
      '✦ **8 univers** à découvrir',
      '✦ **Liens directs** vers les boutiques'
    ].join('\n')
  );

  addSeparator(c);

  addText(
    c,
    [
      '### ✧ Avant de commander',
      '',
      '⏳ Les délais et les montants maximums varient selon la boutique.',
      '',
      `🎫 Pour obtenir les informations, rendez-vous dans ${ticket()}.`
    ].join('\n')
  );

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      ticketButton()
    )
  );

  return c;
}

// ========================================
// CATÉGORIES PREMIUM
// ========================================

function splitShops(section) {
  // Un TextDisplay Discord est limité à
  // 4000 caractères.
  // On garde une marge pour la mise en forme.

  const chunks = [];
  let current = '';

  for (const name of section.shops) {
    const line = shopLine(name);

    const candidate = current
      ? `${current}\n${line}`
      : line;

    if (candidate.length > 2500 && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function premiumCategory(section, index) {
  const c = premiumContainer();

  const number = String(index + 1).padStart(2, '0');

  addText(
    c,
    [
      `### ${number}  |  ${section.title}`,
      `*${section.subtitle}*`
    ].join('\n')
  );

  addSeparator(c);

  const chunks = splitShops(section);

  chunks.forEach((chunk, chunkIndex) => {
    if (chunkIndex > 0) {
      addSeparator(c);
    }

    addText(c, chunk);
  });

  addSeparator(c);

  addText(
    c,
    [
      `✦ **${section.shops.length} boutiques**`,
      '',
      '💬 *Une question ou une boutique introuvable ?*',
      `Consultez ${ticket()} pour les délais, limites et disponibilités.`
    ].join('\n')
  );

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      ticketButton()
    )
  );

  return c;
}

// ========================================
// CONCLUSION PREMIUM
// ========================================

function premiumOutro() {
  const c = premiumContainer();

  addText(
    c,
    [
      '## 💙 ZERX MARKET',
      '### VOTRE EXPÉRIENCE, NOTRE PRIORITÉ'
    ].join('\n')
  );

  addSeparator(c);

  addText(
    c,
    [
      '⬆️ **Remontez dans le salon** pour parcourir toutes les catégories du catalogue.',
      '',
      '### ✧ Besoin d’aide ?',
      '',
      'Vous ne trouvez pas votre boutique ?',
      'Vous souhaitez connaître un délai, une limite ou une disponibilité ?',
      '',
      `🎫 Notre équipe vous répond dans ${ticket()}.`
    ].join('\n')
  );

  addSeparator(c);

  addText(
    c,
    [
      '### ✧ Une boutique manque à la liste ?',
      '',
      'Ce catalogue ne comprend pas nécessairement toutes les boutiques pouvant être proposées en RF.',
      '',
      'Envoyez-nous le lien du site via un ticket : notre équipe vérifiera si votre demande est réalisable.'
    ].join('\n')
  );

  addSeparator(c);

  addText(
    c,
    [
      '**❤️ Merci pour votre confiance !**',
      '',
      '*Zerx Market — Catalogue officiel*'
    ].join('\n')
  );

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      ticketButton(),
      catalogButton(),
      serverButton()
    )
  );

  return c;
}

// ========================================
// CONSTRUCTION DES MESSAGES PREMIUM
// ========================================

function catalogMessages() {
  const messages = [];

  messages.push({
    flags: MessageFlags.IsComponentsV2,
    components: [premiumIntro()],
    allowedMentions: { parse: [] }
  });

  CATALOG.forEach((section, index) => {
    messages.push({
      flags: MessageFlags.IsComponentsV2,
      components: [
        premiumCategory(section, index)
      ],
      allowedMentions: { parse: [] }
    });
  });

  messages.push({
    flags: MessageFlags.IsComponentsV2,
    components: [premiumOutro()],
    allowedMentions: { parse: [] }
  });

  return messages;
}

// ========================================
// CONTRÔLES /MESSAGE
// ========================================

function catalogControls(channelId = null) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('zm:catalog:channel')
    .setPlaceholder('📢 Choisir le salon du catalogue')
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setMinValues(1)
    .setMaxValues(1);

  if (channelId) {
    menu.setDefaultChannels(channelId);
  }

  return [
    new ActionRowBuilder().addComponents(menu),

    buttons(
      [
        'zm:catalog:send',
        'Publier le catalogue Premium',
        ButtonStyle.Success
      ],
      [
        'zm:catalog:cancel',
        'Annuler',
        ButtonStyle.Danger
      ]
    )
  ];
}

// ========================================
// PERMISSIONS
// ========================================

async function allowedChannel(interaction, channelId) {
  const channel = await interaction.guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel?.send) {
    return null;
  }

  const member = await interaction.guild.members.fetchMe();

  const permissions = channel.permissionsFor(member);

  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles
  ];

  if (!permissions?.has(required)) {
    return null;
  }

  return channel;
}

// ========================================
// DÉMARRAGE
// ========================================

client.once(Events.ClientReady, async () => {
  console.log(
    `✅ Zerx Market connecté : ${client.user.tag}`
  );

  try {
    const rest = new REST({
      version: '10'
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands.map(command => command.toJSON())
      }
    );

    console.log(
      '✅ Commandes /vouch et /message enregistrées.'
    );

    const count = CATALOG.reduce(
      (total, section) =>
        total + section.shops.length,
      0
    );

    console.log(
      `💎 Catalogue Premium chargé : ${count} entrées.`
    );

  } catch (error) {
    console.error(
      '❌ Erreur enregistrement commandes :',
      error
    );
  }
});

// ========================================
// INTERACTIONS
// ========================================

client.on(Events.InteractionCreate, async i => {
  if (
    !i.isChatInputCommand() &&
    !i.isButton() &&
    !i.isModalSubmit() &&
    !i.isChannelSelectMenu()
  ) {
    return;
  }

  try {
    // PROPRIÉTAIRE UNIQUEMENT
    if (i.user.id !== OWNER_ID) {
      return i.reply({
        content: '⛔ Tu ne peux pas utiliser ce bot.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (
      !i.inGuild() ||
      i.guildId !== GUILD_ID
    ) {
      return i.reply({
        content: '⛔ Serveur non autorisé.',
        flags: MessageFlags.Ephemeral
      });
    }

    // ====================================
    // COMMANDE /MESSAGE
    // ====================================

    if (
      i.isChatInputCommand() &&
      i.commandName === 'message'
    ) {
      catalogSessions.set(OWNER_ID, {
        step: 'choose',
        channelId: i.channelId,
        targetChannelId: null,
        updated: Date.now(),
        sending: false
      });

      const total = CATALOG.reduce(
        (count, section) =>
          count + section.shops.length,
        0
      );

      return i.reply({
        content:
          '💎 **ZERX MARKET — CATALOGUE PREMIUM**\n\n' +
          `📚 ${CATALOG.length} catégories\n` +
          `🛍️ ${total} boutiques\n` +
          '🎨 Design bleu nuit Premium\n\n' +
          'Choisis le salon dans lequel publier le catalogue.',

        components: catalogControls(),

        flags: MessageFlags.Ephemeral
      });
    }

    // ====================================
    // INTERACTIONS /MESSAGE
    // ====================================

    if (
      (i.isButton() || i.isChannelSelectMenu()) &&
      i.customId.startsWith('zm:catalog:')
    ) {
      const s = catalogSessions.get(OWNER_ID);

      if (
        !s ||
        s.channelId !== i.channelId ||
        Date.now() - s.updated > SESSION_TIMEOUT
      ) {
        return i.reply({
          content:
            '⌛ Session expirée. Relance `/message`.',
          flags: MessageFlags.Ephemeral
        });
      }

      // CHOIX DU SALON
      if (i.customId === 'zm:catalog:channel') {
        if (s.step !== 'choose') {
          return i.reply({
            content: '⏳ Publication en cours.',
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = await allowedChannel(
          i,
          i.values[0]
        );

        if (!channel) {
          return i.reply({
            content:
              '❌ Salon inaccessible ou permissions insuffisantes.',
            flags: MessageFlags.Ephemeral
          });
        }

        s.targetChannelId = channel.id;
        s.updated = Date.now();

        return i.update({
          content:
            '💎 **Catalogue Premium prêt !**\n\n' +
            `📢 Salon : <#${channel.id}>\n\n` +
            'Clique sur **Publier le catalogue Premium** pour confirmer.',

          components: catalogControls(channel.id)
        });
      }

      // ANNULER
      if (i.customId === 'zm:catalog:cancel') {
        if (s.sending) {
          return i.reply({
            content: '⏳ Publication déjà commencée.',
            flags: MessageFlags.Ephemeral
          });
        }

        catalogSessions.delete(OWNER_ID);

        return i.update({
          content: '❌ Publication annulée.',
          components: []
        });
      }

      // PUBLIER
      if (i.customId === 'zm:catalog:send') {
        if (s.sending || s.step !== 'choose') {
          return i.reply({
            content: '⏳ Publication déjà en cours.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (!s.targetChannelId) {
          return i.reply({
            content:
              '📢 Choisis un salon avant de publier.',
            flags: MessageFlags.Ephemeral
          });
        }

        // ANTI-DOUBLE CLIC
        s.sending = true;
        s.step = 'sending';

        await i.update({
          content:
            '⏳ Publication du catalogue Premium en cours…',
          components: []
        });

        let count = 0;

        try {
          const channel = await allowedChannel(
            i,
            s.targetChannelId
          );

          if (!channel) {
            throw new Error('Salon inaccessible');
          }

          // INTRO + 8 CATÉGORIES + CONCLUSION
          for (const payload of catalogMessages()) {
            await channel.send(payload);
            count++;
          }

          catalogSessions.delete(OWNER_ID);

          return i.editReply({
            content:
              '💎 **CATALOGUE PREMIUM PUBLIÉ !**\n\n' +
              `📢 Salon : <#${channel.id}>\n` +
              `📨 ${count} messages envoyés.\n` +
              '🎨 Design bleu nuit activé.',

            components: []
          });

        } catch (error) {
          console.error(
            'Erreur publication catalogue :',
            error
          );

          catalogSessions.delete(OWNER_ID);

          return i.editReply({
            content:
              `❌ Publication interrompue après ${count} message(s).\n\n` +
              'Vérifie le salon avant de relancer `/message` pour éviter les doublons.',

            components: []
          });
        }
      }

      return;
    }

    // ====================================
    // COMMANDE /VOUCH
    // ====================================

    if (
      i.isChatInputCommand() &&
      i.commandName === 'vouch'
    ) {
      sessions.set(OWNER_ID, {
        step: 'type',
        type: null,
        channelId: i.channelId,
        updated: Date.now(),
        photos: [],
        targetChannelId: null,
        publishing: false
      });

      return i.reply({
        content: '📋 **De quel type est ce vouch ?**',

        components: [
          buttons(
            ['zm:rf', 'RF', ButtonStyle.Primary],
            ['zm:ue', 'UE', ButtonStyle.Success]
          )
        ],

        flags: MessageFlags.Ephemeral
      });
    }

    // VOUCH DÉJÀ PUBLIÉ
    if (
      i.isButton() &&
      i.customId === 'zm:confirm' &&
      completedPreviews.has(i.message.id)
    ) {
      return i.reply({
        content: '✅ Ce vouch a déjà été publié.',
        flags: MessageFlags.Ephemeral
      });
    }

    const s = getSession();

    if (
      !s ||
      s.channelId !== i.channelId
    ) {
      return i.reply({
        content:
          '⌛ Session expirée. Recommence avec `/vouch`.',
        flags: MessageFlags.Ephemeral
      });
    }

    // ====================================
    // BOUTON RF
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:rf'
    ) {
      if (s.step !== 'type') {
        return i.reply({
          content: 'Formulaire déjà ouvert.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.type = 'RF';
      s.step = 'form';
      touch(s);

      const modal = new ModalBuilder()
        .setCustomId('zm:form:rf')
        .setTitle('Vouch Zerx Market');

      modal.addComponents(
        field(
          'site',
          'Nom du Site',
          'Ex : Amazon.fr'
        ),

        field(
          'amount',
          'Montant',
          'Ex : 250',
          40
        ),

        field(
          'siteUrl',
          'Lien du site (facultatif)',
          'https://www.amazon.fr',
          500,
          false
        ),

        field(
          'comment',
          'Commentaire (optionnel)',
          'Donne ton avis...',
          900,
          false,
          true
        )
      );

      return i.showModal(modal);
    }

    // ====================================
    // BOUTON UE
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:ue'
    ) {
      if (s.step !== 'type') {
        return i.reply({
          content: 'Formulaire déjà ouvert.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.type = 'UE';
      s.step = 'form';
      touch(s);

      const modal = new ModalBuilder()
        .setCustomId('zm:form:ue')
        .setTitle('Vouch UE Zerx Market');

      modal.addComponents(
        field(
          'clientName',
          'Nom du Client',
          'Ex : Paul'
        ),

        field(
          'cook',
          'Cuisto',
          'Ex : GordonEx'
        ),

        field(
          'restaurant',
          'Nom du Restaurant',
          "Ex : McDonald's",
          200,
          true,
          true
        ),

        field(
          'price',
          'Prix commande',
          'Ex : 40',
          40
        ),

        field(
          'notes',
          'Notes Client',
          '',
          500,
          true,
          false,
          'Pas de commentaire.'
        )
      );

      return i.showModal(modal);
    }

    // ====================================
    // FORMULAIRE RF
    // ====================================

    if (
      i.isModalSubmit() &&
      i.customId === 'zm:form:rf'
    ) {
      if (
        s.step !== 'form' ||
        s.type !== 'RF'
      ) {
        return i.reply({
          content: 'Formulaire déjà traité.',
          flags: MessageFlags.Ephemeral
        });
      }

      const siteUrl = normalizeUrl(
        i.fields.getTextInputValue('siteUrl')
      );

      if (siteUrl === null) {
        sessions.delete(OWNER_ID);

        return i.reply({
          content:
            '❌ URL invalide. Relance `/vouch`.',
          flags: MessageFlags.Ephemeral
        });
      }

      Object.assign(s, {
        site: i.fields.getTextInputValue('site'),
        amount: i.fields.getTextInputValue('amount'),
        siteUrl,
        comment:
          i.fields.getTextInputValue('comment') || '',
        step: 'photo1'
      });

      touch(s);

      return i.reply({
        content:
          '📸 **Envoie ta première photo dans ce salon.**',
        flags: MessageFlags.Ephemeral
      });
    }

    // ====================================
    // FORMULAIRE UE
    // ====================================

    if (
      i.isModalSubmit() &&
      i.customId === 'zm:form:ue'
    ) {
      if (
        s.step !== 'form' ||
        s.type !== 'UE'
      ) {
        return i.reply({
          content: 'Formulaire déjà traité.',
          flags: MessageFlags.Ephemeral
        });
      }

      Object.assign(s, {
        clientName:
          i.fields.getTextInputValue('clientName'),

        cook:
          i.fields.getTextInputValue('cook'),

        restaurant:
          i.fields.getTextInputValue('restaurant'),

        price:
          i.fields.getTextInputValue('price'),

        notes:
          i.fields.getTextInputValue('notes'),

        step: 'photo1'
      });

      touch(s);

      return i.reply({
        content:
          '📸 **Envoie ta photo vouch UE dans ce salon.**',
        flags: MessageFlags.Ephemeral
      });
    }

    // ====================================
    // RF : DEUXIÈME PHOTO OUI
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:photo2yes'
    ) {
      if (
        s.type !== 'RF' ||
        s.step !== 'ask2'
      ) {
        return i.reply({
          content: 'Étape terminée.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.step = 'photo2';
      touch(s);

      return i.update({
        content:
          '📸 **Envoie ta deuxième photo dans ce salon.**',
        components: []
      });
    }

    // ====================================
    // RF : DEUXIÈME PHOTO NON
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:photo2no'
    ) {
      if (
        s.type !== 'RF' ||
        s.step !== 'ask2'
      ) {
        return i.reply({
          content: 'Étape terminée.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.step = 'processing';

      await i.update({
        content:
          '✅ Préparation de la prévisualisation...',
        components: []
      });

      return showPreview(i.channel, s);
    }

    // ====================================
    // CHOIX DU SALON VOUCH
    // ====================================

    if (
      i.isChannelSelectMenu() &&
      i.customId === 'zm:channel'
    ) {
      if (
        s.step !== 'preview' ||
        s.previewMessageId !== i.message.id
      ) {
        return i.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = await allowedChannel(
        i,
        i.values[0]
      );

      if (!channel) {
        return i.reply({
          content: '❌ Permissions insuffisantes.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.targetChannelId = channel.id;
      touch(s);

      return i.update({
        components: [
          new TextDisplayBuilder().setContent(
            `### 👀 Prévisualisation du vouch ${s.type}`
          ),

          ...buildVouch(
            s,
            s.photos.map(photo => photo.url)
          ),

          new TextDisplayBuilder().setContent(
            `📢 **Publication dans :** <#${channel.id}>`
          ),

          ...vouchControls(s)
        ],

        allowedMentions: { parse: [] }
      });
    }

    // ====================================
    // ANNULER LE VOUCH
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:cancel'
    ) {
      if (
        s.step !== 'preview' ||
        s.previewMessageId !== i.message.id
      ) {
        return i.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral
        });
      }

      sessions.delete(OWNER_ID);

      return i.update({
        components: [
          new TextDisplayBuilder().setContent(
            '❌ **Vouch annulé. Rien n’a été publié.**'
          )
        ]
      });
    }

    // ====================================
    // CONFIRMER LE VOUCH
    // ====================================

    if (
      i.isButton() &&
      i.customId === 'zm:confirm'
    ) {
      if (s.previewMessageId !== i.message.id) {
        return i.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (s.publishing || s.step === 'publishing') {
        return i.reply({
          content: '⏳ Publication déjà en cours.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (s.step !== 'preview') {
        return i.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (!s.targetChannelId) {
        return i.reply({
          content: '📢 Choisis un salon.',
          flags: MessageFlags.Ephemeral
        });
      }

      s.publishing = true;
      s.step = 'publishing';
      touch(s);

      await i.deferUpdate();

      let published = null;

      try {
        const channel = await allowedChannel(
          i,
          s.targetChannelId
        );

        if (!channel) {
          throw new Error('Salon inaccessible');
        }

        const { files, urls } = prepared(s);

        published = await channel.send({
          flags: MessageFlags.IsComponentsV2,

          components: buildVouch(s, urls),

          files,

          allowedMentions: { parse: [] }
        });

        completedPreviews.add(s.previewMessageId);
        sessions.delete(OWNER_ID);

        await i.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              [
                `## ✅ Vouch ${s.type} publié !`,
                '',
                `📢 Salon : <#${channel.id}>`,
                `🔗 [Voir le vouch publié](${published.url})`
              ].join('\n')
            )
          ]
        }).catch(console.error);

      } catch (error) {
        console.error(
          'Erreur publication vouch :',
          error
        );

        if (published) {
          completedPreviews.add(s.previewMessageId);
          sessions.delete(OWNER_ID);
          return;
        }

        s.publishing = false;
        s.step = 'preview';
        touch(s);

        await i.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              '❌ **Publication impossible. Vérifie le salon avant de réessayer.**'
            ),

            ...buildVouch(
              s,
              s.photos.map(photo => photo.url)
            ),

            ...vouchControls(s)
          ]
        }).catch(() => {});
      }

      return;
    }

  } catch (error) {
    console.error('Erreur interaction :', error);

    const payload = {
      content: '❌ Une erreur est survenue.',
      flags: MessageFlags.Ephemeral
    };

    if (i.replied || i.deferred) {
      await i.followUp(payload).catch(() => {});
    } else {
      await i.reply(payload).catch(() => {});
    }
  }
});

// ========================================
// RÉCEPTION DES PHOTOS VOUCH
// ========================================

client.on(Events.MessageCreate, async message => {
  if (
    message.author.bot ||
    message.author.id !== OWNER_ID ||
    message.guildId !== GUILD_ID
  ) {
    return;
  }

  const s = getSession();

  if (
    !s ||
    s.channelId !== message.channelId ||
    !['photo1', 'photo2'].includes(s.step)
  ) {
    return;
  }

  const attachment = imageOf(message);

  if (!attachment) {
    return;
  }

  if (attachment.size > MAX_IMAGE_BYTES) {
    return message.reply(
      '❌ Photo trop volumineuse (8 Mo max).'
    );
  }

  const previousStep = s.step;

  s.step = 'processing';
  touch(s);

  let added = false;

  try {
    const photo = await prepPhoto(attachment);

    s.photos.push(photo);
    added = true;

    if (
      s.type === 'RF' &&
      previousStep === 'photo1'
    ) {
      s.step = 'ask2';
      touch(s);

      await message.reply({
        content:
          '📸 **As-tu une 2e photo à ajouter ?**',

        components: [
          buttons(
            [
              'zm:photo2yes',
              'Oui',
              ButtonStyle.Success
            ],
            [
              'zm:photo2no',
              'Non',
              ButtonStyle.Danger
            ]
          )
        ]
      });

    } else {
      await showPreview(message.channel, s);
    }

  } catch (error) {
    console.error(
      'Erreur traitement photo :',
      error
    );

    if (added) {
      s.photos.pop();
    }

    s.step = previousStep;
    touch(s);

    const content =
      error.message === 'IMAGE_TOO_LARGE'
        ? '❌ Photo trop volumineuse (8 Mo max).'
        : '❌ Impossible de traiter la photo. Réessaie.';

    await message.reply(content).catch(() => {});
  }
});

// ========================================
// CONNEXION DISCORD
// ========================================

client.login(TOKEN);
