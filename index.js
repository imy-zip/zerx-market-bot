
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
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// =====================================
// ZERX MARKET - CONFIGURATION
// =====================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID =
  process.env.GUILD_ID || '1195047756910309456';

const OWNER_ID = '1195042683064942624';

const SESSION_TIMEOUT = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const sessions = new Map();

if (!TOKEN || !CLIENT_ID) {
  throw new Error(
    'DISCORD_TOKEN et CLIENT_ID sont obligatoires.'
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =====================================
// OUTILS
// =====================================

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

function rowButtons(...items) {
  return new ActionRowBuilder().addComponents(
    items.map(([id, label, style]) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
    )
  );
}

function safeText(value) {
  return String(value || '')
    .replace(/@everyone/g, '@ everyone')
    .replace(/@here/g, '@ here')
    .replace(/<@/g, '< @')
    .trim();
}

function getTitle(s) {
  const site = safeText(s.site)
    .toUpperCase()
    .replace(/\n/g, ' ');

  const amount = safeText(s.amount)
    .replace(/\n/g, ' ');

  return `${site} - ${
    amount.includes('€') ? amount : amount + '€'
  }`;
}

function getImage(message) {
  return message.attachments.find((a) => {
    return (
      a.contentType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|webp|gif)$/i.test(a.name || '')
    );
  });
}

function getExtension(attachment) {
  const match = /\.(png|jpg|jpeg|webp|gif)$/i.exec(
    attachment.name || ''
  );

  return match ? match[1].toLowerCase() : 'png';
}

// =====================================
// DESIGN DU VOUCH - COMPONENTS V2
// =====================================

function buildVouch(s, photoUrls) {
  const components = [];

  // 1. PHOTOS TOUT EN HAUT
  const gallery = new MediaGalleryBuilder();

  for (const url of photoUrls) {
    gallery.addItems((item) => item.setURL(url));
  }

  components.push(gallery);

  // 2. TITRE SOUS LES PHOTOS
  components.push(
    new TextDisplayBuilder().setContent(
      `## ${getTitle(s)}`
    )
  );

  // 3. COMMENTAIRE FACULTATIF
  if (s.comment && s.comment.trim()) {
    components.push(
      new TextDisplayBuilder().setContent(
        `💬 ${safeText(s.comment)}`
      )
    );
  }

  // =====================================
  // 4. ESPACEMENT AVEC CARACTÈRES INVISIBLES
  //    AUCUNE LIGNE DE SÉPARATION
  // =====================================
  components.push(
    new TextDisplayBuilder().setContent(
      '\u200B\n\u200B\n\u200B'
    )
  );

  // 5. LIENS UTILES
  components.push(
    new TextDisplayBuilder().setContent(
      [
        '**Liens utiles :**',
        '',
        '🛒 Liste boutiques : <#1195054550588076176>',
        '📩 Me contacter : <#1195054777025958008>',
        '📢 Partager le serveur : https://discord.gg/zYCc9fDZ3C',
      ].join('\n')
    )
  );

  return components;
}

// =====================================
// MENU DE PUBLICATION
// =====================================

function publishControls(s) {
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

    rowButtons(
      ['zm:confirm', 'Confirmer', ButtonStyle.Success],
      ['zm:cancel', 'Annuler', ButtonStyle.Danger]
    ),
  ];
}

// =====================================
// PRÉVISUALISATION
// =====================================

async function showPreview(channel, s) {
  s.step = 'preview';
  touch(s);

  const photos = s.photos.map((p) => p.url);

  const preview = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [
      new TextDisplayBuilder().setContent(
        '### 👀 Prévisualisation du vouch RF'
      ),

      ...buildVouch(s, photos),

      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),

      new TextDisplayBuilder().setContent(
        '📢 **Choisis le salon de publication, puis confirme.**'
      ),

      ...publishControls(s),
    ],
    allowedMentions: { parse: [] },
  });

  s.previewMessageId = preview.id;
}

// =====================================
// COMMANDE SLASH
// =====================================

const command = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Créer un vouch Zerx Market');

// =====================================
// DÉMARRAGE
// =====================================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' })
      .setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      { body: [command.toJSON()] }
    );

    console.log('✅ Commande /vouch enregistrée.');
  } catch (error) {
    console.error('Erreur commande :', error);
  }
});

// =====================================
// INTERACTIONS
// =====================================

client.on(Events.InteractionCreate, async (i) => {
  if (
    !i.isChatInputCommand() &&
    !i.isButton() &&
    !i.isModalSubmit() &&
    !i.isChannelSelectMenu()
  ) {
    return;
  }

  try {
    if (i.user.id !== OWNER_ID) {
      return i.reply({
        content: '⛔ Tu ne peux pas utiliser ce bot.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!i.inGuild() || i.guildId !== GUILD_ID) {
      return i.reply({
        content: '⛔ Serveur non autorisé.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---------------------------------
    // /VOUCH
    // ---------------------------------

    if (i.isChatInputCommand()) {
      if (i.commandName !== 'vouch') return;

      sessions.set(OWNER_ID, {
        step: 'type',
        channelId: i.channelId,
        updated: Date.now(),
        photos: [],
        targetChannelId: null,
      });

      return i.reply({
        content: '📋 **De quel type est ce vouch ?**',
        components: [
          rowButtons(
            ['zm:rf', 'RF', ButtonStyle.Primary],
            ['zm:ue', 'UE (bientôt)', ButtonStyle.Success]
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (i.isButton() && i.customId === 'zm:ue') {
      return i.reply({
        content: '🟢 UE sera ajouté plus tard.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const s = getSession();

    if (!s || s.channelId !== i.channelId) {
      return i.reply({
        content:
          '⌛ Session expirée. Recommence avec `/vouch`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---------------------------------
    // RF -> FORMULAIRE
    // ---------------------------------

    if (i.isButton() && i.customId === 'zm:rf') {
      if (s.step !== 'type') {
        return i.reply({
          content: 'Ce formulaire a déjà été ouvert.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.step = 'form';
      touch(s);

      const modal = new ModalBuilder()
        .setCustomId('zm:form')
        .setTitle('Vouch Zerx Market');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('site')
            .setLabel('Nom du Site')
            .setPlaceholder('Ex : Zooplus.fr')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Montant')
            .setPlaceholder('Ex : 125')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('comment')
            .setLabel('Commentaire (optionnel)')
            .setPlaceholder('Donne ton avis...')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(900)
            .setRequired(false)
        )
      );

      return i.showModal(modal);
    }

    // ---------------------------------
    // FORMULAIRE -> PREMIÈRE PHOTO
    // ---------------------------------

    if (
      i.isModalSubmit() &&
      i.customId === 'zm:form'
    ) {
      if (s.step !== 'form') {
        return i.reply({
          content: 'Formulaire déjà traité.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.site = i.fields.getTextInputValue('site');
      s.amount = i.fields.getTextInputValue('amount');
      s.comment =
        i.fields.getTextInputValue('comment') || '';

      s.step = 'photo1';
      touch(s);

      return i.reply({
        content:
          '📸 **Envoie maintenant ta première photo dans ce salon.**',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---------------------------------
    // DEUXIÈME PHOTO : OUI
    // ---------------------------------

    if (
      i.isButton() &&
      i.customId === 'zm:photo2yes'
    ) {
      if (s.step !== 'ask2') {
        return i.reply({
          content: 'Cette étape est terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.step = 'photo2';
      touch(s);

      return i.update({
        content:
          '📸 **Envoie maintenant ta deuxième photo dans ce salon.**',
        components: [],
      });
    }

    // ---------------------------------
    // DEUXIÈME PHOTO : NON
    // ---------------------------------

    if (
      i.isButton() &&
      i.customId === 'zm:photo2no'
    ) {
      if (s.step !== 'ask2') {
        return i.reply({
          content: 'Cette étape est terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.step = 'processing';

      await i.update({
        content: '✅ Préparation de la prévisualisation...',
        components: [],
      });

      return showPreview(i.channel, s);
    }

    // ---------------------------------
    // CHOIX DU SALON
    // ---------------------------------

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
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = await i.guild.channels
        .fetch(i.values[0])
        .catch(() => null);

      if (!target || !target.send) {
        return i.reply({
          content: '⛔ Salon non compatible.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember =
        await i.guild.members.fetchMe();

      const permissions =
        target.permissionsFor(botMember);

      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ];

      if (!permissions?.has(needed)) {
        return i.reply({
          content:
            '⛔ Le bot manque de permissions dans ce salon.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.targetChannelId = target.id;
      touch(s);

      return i.update({
        components: [
          new TextDisplayBuilder().setContent(
            '### 👀 Prévisualisation du vouch RF'
          ),

          ...buildVouch(
            s,
            s.photos.map((p) => p.url)
          ),

          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),

          new TextDisplayBuilder().setContent(
            `📢 **Publication dans :** <#${target.id}>`
          ),

          ...publishControls(s),
        ],
        allowedMentions: { parse: [] },
      });
    }

    // ---------------------------------
    // ANNULER
    // ---------------------------------

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
          flags: MessageFlags.Ephemeral,
        });
      }

      sessions.delete(OWNER_ID);

      return i.update({
        components: [
          new TextDisplayBuilder().setContent(
            '❌ **Vouch annulé. Rien n’a été publié.**'
          ),
        ],
      });
    }

    // ---------------------------------
    // CONFIRMER -> PUBLICATION
    // ---------------------------------

    if (
      i.isButton() &&
      i.customId === 'zm:confirm'
    ) {
      if (
        s.step !== 'preview' ||
        s.previewMessageId !== i.message.id
      ) {
        return i.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!s.targetChannelId) {
        return i.reply({
          content:
            '📢 Choisis d’abord le salon de publication.',
          flags: MessageFlags.Ephemeral,
        });
      }

      s.step = 'publishing';
      touch(s);

      await i.deferUpdate();

      try {
        const target =
          await i.guild.channels.fetch(
            s.targetChannelId
          );

        if (!target?.send) {
          throw new Error('Salon indisponible');
        }

        const files = [];
        const photoUrls = [];

        // Téléchargement des photos pour
        // les joindre directement au vouch.
        for (let n = 0; n < s.photos.length; n++) {
          const photo = s.photos[n];

          const response = await fetch(photo.url);

          if (!response.ok) {
            throw new Error(
              'Téléchargement de photo impossible'
            );
          }

          const buffer = Buffer.from(
            await response.arrayBuffer()
          );

          if (buffer.length > MAX_IMAGE_BYTES) {
            throw new Error('Photo trop volumineuse');
          }

          const filename =
            `zerx-market-${n + 1}.${photo.ext}`;

          files.push(
            new AttachmentBuilder(buffer, {
              name: filename,
            })
          );

          photoUrls.push(
            `attachment://${filename}`
          );
        }

        const published = await target.send({
          flags: MessageFlags.IsComponentsV2,
          components: buildVouch(s, photoUrls),
          files,
          allowedMentions: { parse: [] },
        });

        sessions.delete(OWNER_ID);

        await i.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              [
                '## ✅ Vouch RF publié !',
                '',
                `📢 Salon : <#${target.id}>`,
                `🔗 [Voir le vouch publié](${published.url})`,
              ].join('\n')
            ),
          ],
        });

      } catch (error) {
        console.error(
          'Erreur publication :',
          error
        );

        s.step = 'preview';

        await i.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              '❌ **Publication impossible. Réessaie.**'
            ),

            ...buildVouch(
              s,
              s.photos.map((p) => p.url)
            ),

            ...publishControls(s),
          ],
        }).catch(() => {});
      }

      return;
    }

  } catch (error) {
    console.error('Erreur interaction :', error);

    const payload = {
      content:
        '❌ Une erreur est survenue. Réessaie.',
      flags: MessageFlags.Ephemeral,
    };

    if (i.replied || i.deferred) {
      await i.followUp(payload).catch(() => {});
    } else {
      await i.reply(payload).catch(() => {});
    }
  }
});

// =====================================
// RÉCEPTION DES PHOTOS
// =====================================

client.on(Events.MessageCreate, async (message) => {
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

  const attachment = getImage(message);

  if (!attachment) return;

  if (
    attachment.size &&
    attachment.size > MAX_IMAGE_BYTES
  ) {
    return message.reply(
      '❌ Photo trop volumineuse. Utilise une image de moins de 8 Mo.'
    );
  }

  const previousStep = s.step;

  s.step = 'processing';
  touch(s);

  s.photos.push({
    url: attachment.url,
    ext: getExtension(attachment),
  });

  try {
    if (previousStep === 'photo1') {
      s.step = 'ask2';
      touch(s);

      await message.reply({
        content:
          '📸 **As-tu une 2e photo à ajouter ?**',
        components: [
          rowButtons(
            [
              'zm:photo2yes',
              'Oui',
              ButtonStyle.Success,
            ],
            [
              'zm:photo2no',
              'Non',
              ButtonStyle.Danger,
            ]
          ),
        ],
      });
    } else {
      await showPreview(message.channel, s);
    }

  } catch (error) {
    console.error('Erreur photo :', error);

    s.photos.pop();
    s.step = previousStep;

    await message.reply(
      '❌ Impossible de traiter la photo. Réessaie.'
    ).catch(() => {});
  }
});

// =====================================
// CONNEXION
// =====================================

client.login(TOKEN);
