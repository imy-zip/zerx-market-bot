
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
  const session = sessions.get(OWNER_ID);

  if (!session) return null;

  if (Date.now() - session.updated > SESSION_TIMEOUT) {
    sessions.delete(OWNER_ID);
    return null;
  }

  return session;
}

function touch(session) {
  session.updated = Date.now();
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

function escapeMarkdown(value) {
  return safeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/([[\]()*_~`>|])/g, '\\$1');
}

function normalizeSiteUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function getRFTitle(session) {
  const site = escapeMarkdown(session.site)
    .toUpperCase()
    .replace(/\n/g, ' ');

  const amount = escapeMarkdown(session.amount)
    .replace(/\n/g, ' ');

  const formattedAmount = amount.includes('€')
    ? amount
    : `${amount}€`;

  // Le lien concerne seulement le nom du site.
  const siteTitle = session.siteUrl
    ? `[${site}](${session.siteUrl})`
    : site;

  return `${siteTitle} - ${formattedAmount}`;
}

function getImage(message) {
  return message.attachments.find(
    (attachment) =>
      attachment.contentType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|webp|gif)$/i.test(
        attachment.name || ''
      )
  );
}

function getExtension(attachment) {
  const match = /\.(png|jpg|jpeg|webp|gif)$/i.exec(
    attachment.name || ''
  );

  return match ? match[1].toLowerCase() : 'png';
}

// =====================================
// DESIGN DU VOUCH RF
// =====================================

function buildRFVouch(session, photoUrls) {
  const container = new ContainerBuilder();

  // PHOTOS EN HAUT
  const gallery = new MediaGalleryBuilder();

  for (const url of photoUrls) {
    gallery.addItems((item) => item.setURL(url));
  }

  container.addMediaGalleryComponents(gallery);

  // TITRE LÉGÈREMENT PLUS PETIT
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${getRFTitle(session)}`
    )
  );

  // COMMENTAIRE FACULTATIF
  if (session.comment && session.comment.trim()) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `💬 ${safeText(session.comment)}`
      )
    );
  }

  // UNE SEULE LIGNE INVISIBLE
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('\u200B')
  );

  // BARRE HORIZONTALE
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  // LIENS UTILES - RF UNIQUEMENT
  container.addTextDisplayComponents(
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

  return [container];
}

// =====================================
// DESIGN DU VOUCH UE
// =====================================

function buildUEVouch(session, photoUrls) {
  const container = new ContainerBuilder();

  // PHOTO DU VOUCH EN HAUT
  const gallery = new MediaGalleryBuilder();

  for (const url of photoUrls) {
    gallery.addItems((item) => item.setURL(url));
  }

  container.addMediaGalleryComponents(gallery);

  // TITRE
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**🍕 Nouvelle livraison terminée !**'
    )
  );

  // SÉPARATION SOUS LE TITRE
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '━━━━━━━━━━━━━'
    )
  );

  // INFORMATIONS UE
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `👤 **Client :** ${escapeMarkdown(session.clientName)}`,
        '',
        `👨‍🍳 **Cuisto :** ${escapeMarkdown(session.cook)}`,
        '',
        `🍔 **Restaurant :** ${escapeMarkdown(session.restaurant)}`,
        '',
        `💵 **Total :** ${escapeMarkdown(session.price)}`,
        '',
        `📝 **Avis Client :** ${escapeMarkdown(session.notes)}`,
      ].join('\n')
    )
  );

  // PAS DE LIENS UTILES POUR UE
  return [container];
}

// =====================================
// CONSTRUIRE LE BON VOUCH
// =====================================

function buildVouch(session, photoUrls) {
  if (session.type === 'UE') {
    return buildUEVouch(session, photoUrls);
  }

  return buildRFVouch(session, photoUrls);
}

// =====================================
// MENU DE PUBLICATION
// =====================================

function publishControls(session) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('zm:channel')
    .setPlaceholder('📢 Choisir le salon de publication')
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    )
    .setMinValues(1)
    .setMaxValues(1);

  if (session.targetChannelId) {
    menu.setDefaultChannels(session.targetChannelId);
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
// PRÉVISUALISATION RF / UE
// =====================================

async function showPreview(channel, session) {
  session.step = 'processing';
  touch(session);

  const photos = session.photos.map(
    (photo) => photo.url
  );

  const preview = await channel.send({
    flags: MessageFlags.IsComponentsV2,

    components: [
      new TextDisplayBuilder().setContent(
        `### 👀 Prévisualisation du vouch ${session.type}`
      ),

      ...buildVouch(session, photos),

      new TextDisplayBuilder().setContent(
        '📢 **Choisis le salon de publication, puis confirme.**'
      ),

      ...publishControls(session),
    ],

    allowedMentions: { parse: [] },
  });

  session.previewMessageId = preview.id;
  session.step = 'preview';
  touch(session);
}

// =====================================
// COMMANDE /VOUCH
// =====================================

const command = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Créer un vouch Zerx Market');

// =====================================
// DÉMARRAGE DU BOT
// =====================================

client.once(Events.ClientReady, async () => {
  console.log(
    `✅ Zerx Market connecté : ${client.user.tag}`
  );

  try {
    const rest = new REST({
      version: '10',
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: [command.toJSON()],
      }
    );

    console.log('✅ Commande /vouch enregistrée.');
  } catch (error) {
    console.error(
      'Erreur installation commande :',
      error
    );
  }
});

// =====================================
// INTERACTIONS DISCORD
// =====================================

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isModalSubmit() &&
    !interaction.isChannelSelectMenu()
  ) {
    return;
  }

  try {
    // PROPRIÉTAIRE UNIQUEMENT
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '⛔ Tu ne peux pas utiliser ce bot.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // SERVEUR AUTORISÉ UNIQUEMENT
    if (
      !interaction.inGuild() ||
      interaction.guildId !== GUILD_ID
    ) {
      return interaction.reply({
        content: '⛔ Serveur non autorisé.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // =================================
    // 1. COMMANDE /VOUCH
    // =================================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'vouch') {
        return;
      }

      sessions.set(OWNER_ID, {
        step: 'type',
        type: null,
        channelId: interaction.channelId,
        updated: Date.now(),
        photos: [],
        targetChannelId: null,
      });

      return interaction.reply({
        content: '📋 **De quel type est ce vouch ?**',

        components: [
          rowButtons(
            ['zm:rf', 'RF', ButtonStyle.Primary],
            ['zm:ue', 'UE', ButtonStyle.Success]
          ),
        ],

        flags: MessageFlags.Ephemeral,
      });
    }

    const session = getSession();

    if (
      !session ||
      session.channelId !== interaction.channelId
    ) {
      return interaction.reply({
        content:
          '⌛ Session expirée. Recommence avec `/vouch`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // =================================
    // 2. BOUTON RF
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:rf'
    ) {
      if (session.step !== 'type') {
        return interaction.reply({
          content: 'Ce formulaire a déjà été ouvert.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.type = 'RF';
      session.step = 'form';
      touch(session);

      const modal = new ModalBuilder()
        .setCustomId('zm:form:rf')
        .setTitle('Vouch Zerx Market');

      modal.addComponents(
        // NOM DU SITE
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('site')
            .setLabel('Nom du Site')
            .setPlaceholder('Ex : Amazon.fr')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),

        // MONTANT
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Montant')
            .setPlaceholder('Ex : 250')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(true)
        ),

        // LIEN FACULTATIF
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('siteUrl')
            .setLabel('Lien du site (facultatif)')
            .setPlaceholder('https://www.amazon.fr')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(500)
            .setRequired(false)
        ),

        // COMMENTAIRE FACULTATIF
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

      return interaction.showModal(modal);
    }

    // =================================
    // 3. BOUTON UE
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:ue'
    ) {
      if (session.step !== 'type') {
        return interaction.reply({
          content: 'Ce formulaire a déjà été ouvert.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.type = 'UE';
      session.step = 'form';
      touch(session);

      const modal = new ModalBuilder()
        .setCustomId('zm:form:ue')
        .setTitle('Vouch UE Zerx Market');

      modal.addComponents(
        // NOM DU CLIENT
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('clientName')
            .setLabel('Nom du Client')
            .setPlaceholder('Ex : Paul')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),

        // CUISTO
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('cook')
            .setLabel('Cuisto')
            .setPlaceholder('Ex : GordonEx')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),

        // NOM DU RESTAURANT
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('restaurant')
            .setLabel('Nom du Restaurant')
            .setPlaceholder("Ex : McDonald's")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(200)
            .setRequired(true)
        ),

        // PRIX COMMANDE
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Prix commande')
            .setPlaceholder('Ex : 40€')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(true)
        ),

        // NOTES CLIENT
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('notes')
            .setLabel('Notes Client')
            .setValue('Pas de commentaire.')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(500)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    // =================================
    // 4. FORMULAIRE RF
    // =================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'zm:form:rf'
    ) {
      if (
        session.step !== 'form' ||
        session.type !== 'RF'
      ) {
        return interaction.reply({
          content: 'Formulaire déjà traité.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const rawSiteUrl =
        interaction.fields.getTextInputValue('siteUrl');

      const siteUrl = normalizeSiteUrl(rawSiteUrl);

      if (siteUrl === null) {
        sessions.delete(OWNER_ID);

        return interaction.reply({
          content:
            '❌ Le lien du site doit être une adresse valide commençant par `https://` ou `http://`. Recommence avec `/vouch`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.site =
        interaction.fields.getTextInputValue('site');

      session.amount =
        interaction.fields.getTextInputValue('amount');

      session.siteUrl = siteUrl;

      session.comment =
        interaction.fields.getTextInputValue('comment') || '';

      session.step = 'photo1';
      touch(session);

      return interaction.reply({
        content:
          '📸 **Envoie maintenant ta première photo dans ce salon.**',
        flags: MessageFlags.Ephemeral,
      });
    }

    // =================================
    // 5. FORMULAIRE UE
    // =================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'zm:form:ue'
    ) {
      if (
        session.step !== 'form' ||
        session.type !== 'UE'
      ) {
        return interaction.reply({
          content: 'Formulaire déjà traité.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.clientName =
        interaction.fields.getTextInputValue('clientName');

      session.cook =
        interaction.fields.getTextInputValue('cook');

      session.restaurant =
        interaction.fields.getTextInputValue('restaurant');

      session.price =
        interaction.fields.getTextInputValue('price');

      session.notes =
        interaction.fields.getTextInputValue('notes');

      session.step = 'photo1';
      touch(session);

      return interaction.reply({
        content:
          '📸 **Envoie maintenant ta photo vouch UE dans ce salon.**',
        flags: MessageFlags.Ephemeral,
      });
    }

    // =================================
    // 6. RF : DEUXIÈME PHOTO OUI
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:photo2yes'
    ) {
      if (
        session.type !== 'RF' ||
        session.step !== 'ask2'
      ) {
        return interaction.reply({
          content: 'Cette étape est terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'photo2';
      touch(session);

      return interaction.update({
        content:
          '📸 **Envoie maintenant ta deuxième photo dans ce salon.**',
        components: [],
      });
    }

    // =================================
    // 7. RF : DEUXIÈME PHOTO NON
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:photo2no'
    ) {
      if (
        session.type !== 'RF' ||
        session.step !== 'ask2'
      ) {
        return interaction.reply({
          content: 'Cette étape est terminée.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'processing';

      await interaction.update({
        content:
          '✅ Préparation de la prévisualisation...',
        components: [],
      });

      return showPreview(
        interaction.channel,
        session
      );
    }

    // =================================
    // 8. CHOIX DU SALON RF / UE
    // =================================

    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId === 'zm:channel'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = await interaction.guild.channels
        .fetch(interaction.values[0])
        .catch(() => null);

      if (!target || !target.send) {
        return interaction.reply({
          content: '⛔ Salon non compatible.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember =
        await interaction.guild.members.fetchMe();

      const permissions =
        target.permissionsFor(botMember);

      const needed = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ];

      if (!permissions?.has(needed)) {
        return interaction.reply({
          content:
            '⛔ Le bot manque de permissions dans ce salon.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.targetChannelId = target.id;
      touch(session);

      return interaction.update({
        components: [
          new TextDisplayBuilder().setContent(
            `### 👀 Prévisualisation du vouch ${session.type}`
          ),

          ...buildVouch(
            session,
            session.photos.map((photo) => photo.url)
          ),

          new TextDisplayBuilder().setContent(
            `📢 **Publication dans :** <#${target.id}>`
          ),

          ...publishControls(session),
        ],

        allowedMentions: { parse: [] },
      });
    }

    // =================================
    // 9. ANNULER
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:cancel'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral,
        });
      }

      sessions.delete(OWNER_ID);

      return interaction.update({
        components: [
          new TextDisplayBuilder().setContent(
            '❌ **Vouch annulé. Rien n’a été publié.**'
          ),
        ],
      });
    }

    // =================================
    // 10. CONFIRMER ET PUBLIER
    // =================================

    if (
      interaction.isButton() &&
      interaction.customId === 'zm:confirm'
    ) {
      if (
        session.step !== 'preview' ||
        session.previewMessageId !== interaction.message.id
      ) {
        return interaction.reply({
          content: 'Prévisualisation inactive.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!session.targetChannelId) {
        return interaction.reply({
          content:
            '📢 Choisis d’abord le salon de publication.',
          flags: MessageFlags.Ephemeral,
        });
      }

      session.step = 'publishing';
      touch(session);

      await interaction.deferUpdate();

      try {
        const target =
          await interaction.guild.channels.fetch(
            session.targetChannelId
          );

        if (!target?.send) {
          throw new Error('Salon indisponible');
        }

        const files = [];
        const photoUrls = [];

        for (
          let n = 0;
          n < session.photos.length;
          n++
        ) {
          const photo = session.photos[n];

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

          components: buildVouch(
            session,
            photoUrls
          ),

          files,

          allowedMentions: { parse: [] },
        });

        const publishedType = session.type;

        sessions.delete(OWNER_ID);

        await interaction.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              [
                `## ✅ Vouch ${publishedType} publié !`,
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

        session.step = 'preview';

        await interaction.message.edit({
          components: [
            new TextDisplayBuilder().setContent(
              '❌ **Publication impossible. Réessaie.**'
            ),

            ...buildVouch(
              session,
              session.photos.map(
                (photo) => photo.url
              )
            ),

            ...publishControls(session),
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

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// =====================================
// RÉCEPTION DES PHOTOS RF / UE
// =====================================

client.on(Events.MessageCreate, async (message) => {
  if (
    message.author.bot ||
    message.author.id !== OWNER_ID ||
    message.guildId !== GUILD_ID
  ) {
    return;
  }

  const session = getSession();

  if (
    !session ||
    session.channelId !== message.channelId ||
    !['photo1', 'photo2'].includes(session.step)
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

  const previousStep = session.step;

  session.step = 'processing';
  touch(session);

  session.photos.push({
    url: attachment.url,
    ext: getExtension(attachment),
  });

  try {
    // RF : DEMANDER UNE DEUXIÈME PHOTO
    if (
      session.type === 'RF' &&
      previousStep === 'photo1'
    ) {
      session.step = 'ask2';
      touch(session);

      await message.reply({
        content:
          '📸 **As-tu une 2e photo à ajouter ?**',

        components: [
          rowButtons(
            ['zm:photo2yes', 'Oui', ButtonStyle.Success],
            ['zm:photo2no', 'Non', ButtonStyle.Danger]
          ),
        ],
      });

    } else {
      // UE : UNE SEULE PHOTO, PREVIEW DIRECTE
      // RF : PREVIEW APRÈS LA DEUXIÈME PHOTO
      await showPreview(message.channel, session);
    }

  } catch (error) {
    console.error('Erreur photo :', error);

    session.photos.pop();
    session.step = previousStep;

    await message.reply(
      '❌ Impossible de traiter la photo. Réessaie.'
    ).catch(() => {});
  }
});

// =====================================
// CONNEXION
// =====================================

client.login(TOKEN);
